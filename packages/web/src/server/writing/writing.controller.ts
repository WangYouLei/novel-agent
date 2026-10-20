import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { Logger } from '@nestjs/common'
import {
  ModelConfigService,
  NovelService,
  OutlineService,
  PluginRegistryService,
  SessionService,
  StylePackService,
  validatePluginConfig,
} from '@novelagent/application'
import type { FeatureExtensionPoint, FeatureRequest, FeatureResult, ModelSelection } from '@novelagent/core'
import {
  BizError,
  ErrorCode,
  LIMITS,
  type GenerateOutlineRequest,
  type GenerateOutlineResponse,
  type ModelCallSummary,
  type OutlineDto,
  type OutlineStructure,
} from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { resolveModelSelection } from '../common/model-selection'
import { CordisHost } from '../cordis.host'
import { BridgeGateway } from '../gateway/bridge.gateway'

/** 大纲生成功能插件 id（MVP 示例插件） */
const OUTLINE_PLUGIN_ID = 'outline-generator'

/**
 * 创作编排控制器（PRD 5.2 大纲生成核心链路）：
 * 组装 FeatureRequest（模型选择/风格包/插件配置/进度回调）→ 调用功能插件 → 落库返回
 * 插件服务经 CordisHost 动态获取（文档 3.3 规则 1/2，缺失转译为业务错误）
 */
@Controller('api/writing')
@UseGuards(JwtGuard)
export class WritingController {
  private readonly logger = new Logger('Writing')

  constructor(
    private readonly novelService: NovelService,
    private readonly stylePackService: StylePackService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly modelConfigService: ModelConfigService,
    private readonly sessionService: SessionService,
    private readonly outlineService: OutlineService,
    private readonly cordisHost: CordisHost,
    private readonly gateway: BridgeGateway,
  ) {}

  @Post('outline/generate')
  async generateOutline(
    @CurrentUser() userId: string,
    @Body() body: GenerateOutlineRequest,
  ): Promise<GenerateOutlineResponse> {
    // 1. 基础校验
    const idea = (body.idea ?? '').trim()
    if (!idea) throw new BizError(ErrorCode.BAD_REQUEST, '创意描述不能为空')
    if (idea.length > LIMITS.IDEA_MAX_LENGTH) {
      throw new BizError(ErrorCode.BAD_REQUEST, `创意描述不能超过 ${LIMITS.IDEA_MAX_LENGTH} 字`)
    }
    await this.novelService.getById(userId, body.novelId)

    // 2. 插件可用性检查（验收标准 2/5：禁用/依赖缺失时给出明确提示）
    const pluginRecord = await this.pluginRegistry.getByPluginId(userId, OUTLINE_PLUGIN_ID)
    if (!pluginRecord.enabled) {
      throw new BizError(ErrorCode.PLUGIN_NOT_ENABLED, '大纲生成插件已被禁用，请先在插件管理中启用')
    }
    const runtime = this.cordisHost.runtimes.get(OUTLINE_PLUGIN_ID)
    if (!runtime || runtime.status !== 'STARTED') {
      const detail =
        runtime?.status === 'DEPENDENCY_MISSING'
          ? `缺少依赖：${runtime.missing?.join(', ')}`
          : runtime?.errorMessage ?? '插件未加载'
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, `大纲生成插件不可用（${detail}）`)
    }
    const feature = this.cordisHost.getFeature<FeatureExtensionPoint>(OUTLINE_PLUGIN_ID)
    if (!feature) {
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, '缺少大纲生成能力，请检查插件状态')
    }

    // 3. 解析模型选择（内置 mock 或用户自定义配置）
    const modelSelection = await resolveModelSelection(
      {
        modelConfigService: this.modelConfigService,
        pluginRegistry: this.pluginRegistry,
        cordisHost: this.cordisHost,
      },
      userId,
      body.providerId,
      body.modelConfigId,
      body.modelName,
    )

    // 4. 组装 FeatureRequest
    const schema = runtime.manifest.configSchema
    const mergedConfig = this.pluginRegistry.applyDefaults(
      schema,
      (pluginRecord.config as Record<string, unknown>) ?? {},
    )
    const requestConfig = { ...mergedConfig, ...(body.pluginConfig ?? {}) }
    // 请求级 pluginConfig 覆盖后重新过 schema 校验（非法值 400，防止 NaN/越界值传入插件）
    validatePluginConfig(schema, requestConfig)
    const stylePack = await this.stylePackService.getForNovel(body.novelId)

    const sessionId = await this.sessionService.createSession({
      userId,
      novelId: body.novelId,
      sessionType: 'OUTLINE_GEN',
      featurePluginId: OUTLINE_PLUGIN_ID,
      inputSummary: idea,
    })

    const featureRequest: FeatureRequest = {
      userId,
      novelId: body.novelId,
      sessionId,
      input: { idea },
      model: modelSelection,
      stylePack: stylePack
        ? {
            id: stylePack.id,
            builtinKey: stylePack.builtinKey,
            name: stylePack.name,
            content: stylePack.content,
          }
        : undefined,
      config: requestConfig,
      emitProgress: (stage, progress, message) => {
        this.gateway.pushProgress(userId, {
          sessionId,
          novelId: body.novelId,
          stage,
          progress,
          message,
        })
      },
    }

    // 5. 执行插件（进度经 WebSocket 实时推送）
    this.logger.log(`大纲生成开始：用户=${userId} 小说=${body.novelId} 模型=${modelSelection.model}`)
    const started = Date.now()
    const result = await feature.execute(featureRequest)
    if (!result.success || !result.data) {
      await this.sessionService.finishSession(sessionId, 'FAILED', result.error?.message)
      const error = result.error ?? { code: 'GENERATION_FAILED', message: '生成失败' }
      throw new BizError(ErrorCode.GENERATION_FAILED, `[${error.code}] ${error.message}`)
    }

    // 6. 完成：会话记录 + 返回（大纲由前端预览后调保存接口持久化）
    const outline = result.data as OutlineStructure
    await this.sessionService.finishSession(sessionId, 'COMPLETED', outline.logline)
    this.logger.log(`大纲生成完成：${outline.chapters.length} 章，总耗时 ${Date.now() - started}ms`)

    return { sessionId, outline, modelCall: this.toModelCallSummary(modelSelection, result.modelCall) }
  }

  /** 保存生成的大纲（PRD 5.2：用户确认后保存到小说） */
  @Post('outline/save')
  async saveOutline(
    @CurrentUser() userId: string,
    @Body() body: { novelId: string; structure: OutlineStructure; generatedBy?: string },
  ): Promise<OutlineDto> {
    if (!body.structure?.chapters?.length) {
      throw new BizError(ErrorCode.BAD_REQUEST, '大纲内容为空')
    }
    return this.outlineService.save(userId, body.novelId, body.structure, body.generatedBy)
  }

  /** 激活历史大纲版本：将指定版本设为 active，同小说其余版本置为 inactive */
  @Post('outline/activate')
  async activateOutline(
    @CurrentUser() userId: string,
    @Body() body: { outlineId: string },
  ): Promise<OutlineDto> {
    if (!body?.outlineId) {
      throw new BizError(ErrorCode.BAD_REQUEST, '大纲 id 不能为空')
    }
    return this.outlineService.activate(userId, body.outlineId)
  }

  @Get('outlines/:novelId')
  async listOutlines(
    @CurrentUser() userId: string,
    @Param('novelId') novelId: string,
  ): Promise<OutlineDto[]> {
    return this.outlineService.listByNovel(userId, novelId)
  }

  /**
   * 组装响应中的模型调用摘要：直接消费 FeatureResult.modelCall（插件同步带回，评审 M4），
   * 不再 sleep 等待异步统计落库；统计落库仍由 model-call-finished 事件驱动（见 main.ts）
   */
  private toModelCallSummary(
    selection: ModelSelection,
    call: FeatureResult['modelCall'],
  ): ModelCallSummary {
    if (call) {
      return {
        modelProvider: call.providerId,
        modelName: call.model,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        creditCost: call.creditCost,
        durationMs: call.durationMs,
      }
    }
    // 兜底：插件未附带 modelCall（如旧版本插件）时返回零值统计
    return {
      modelProvider: selection.providerId,
      modelName: selection.model,
      inputTokens: 0,
      outputTokens: 0,
      creditCost: 0,
      durationMs: 0,
    }
  }
}
