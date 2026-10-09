import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { Logger } from '@nestjs/common'
import {
  ModelConfigService,
  NovelService,
  OutlineService,
  PluginRegistryService,
  SessionService,
  StylePackService,
} from '@novelagent/application'
import type { FeatureExtensionPoint, FeatureRequest, ModelSelection } from '@novelagent/core'
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
    const modelSelection = await this.resolveModelSelection(userId, body)

    // 4. 组装 FeatureRequest
    const schema = runtime.manifest.configSchema
    const mergedConfig = this.pluginRegistry.applyDefaults(
      schema,
      (pluginRecord.config as Record<string, unknown>) ?? {},
    )
    const requestConfig = { ...mergedConfig, ...(body.pluginConfig ?? {}) }
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

    const summary = await this.collectModelCall(sessionId, modelSelection)
    return { sessionId, outline, modelCall: summary }
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

  @Get('outlines/:novelId')
  async listOutlines(
    @CurrentUser() userId: string,
    @Param('novelId') novelId: string,
  ): Promise<OutlineDto[]> {
    return this.outlineService.listByNovel(userId, novelId)
  }

  /** 解析模型选择：内置免费（mock）或用户自定义配置（解密注入，验收标准 7） */
  private async resolveModelSelection(
    userId: string,
    body: GenerateOutlineRequest,
  ): Promise<ModelSelection> {
    if (body.providerId === 'builtin') {
      return { providerId: 'builtin', model: 'mock-v1' }
    }

    // 自定义模型：必须提供 modelConfigId
    if (!body.modelConfigId) {
      throw new BizError(ErrorCode.BAD_REQUEST, '使用自定义模型时必须选择模型配置')
    }
    const config = await this.modelConfigService.getDecrypted(userId, body.modelConfigId)

    // 校验对应模型插件可用（验收标准 5：禁用模型插件 → 明确提示缺少模型提供者）
    const pluginRecord = await this.pluginRegistry
      .getByPluginId(userId, config.pluginId)
      .catch(() => undefined)
    if (!pluginRecord?.enabled) {
      throw new BizError(
        ErrorCode.MODEL_PROVIDER_MISSING,
        `模型插件 [${config.pluginId}] 已禁用，缺少模型提供者，请先启用`,
      )
    }
    const pluginRuntime = this.cordisHost.runtimes.get(config.pluginId)
    if (!pluginRuntime || pluginRuntime.status !== 'STARTED') {
      throw new BizError(ErrorCode.MODEL_PROVIDER_MISSING, `模型插件 [${config.pluginId}] 未在运行`)
    }

    return {
      providerId: config.pluginId,
      modelConfigId: config.id,
      model: config.modelName,
      // 连接参数解密注入（API Key 不落日志，ADR 见 model-config 服务）
      providerConfig: {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl ?? undefined,
        model: config.modelName,
      },
    }
  }

  /** 从数据库取本次会话的模型调用统计（model-call-finished 事件由 main.ts 统一写库） */
  private async collectModelCall(
    sessionId: string,
    selection: ModelSelection,
  ): Promise<ModelCallSummary> {
    try {
      // 写库是异步的，稍等后查询最新一条调用记录
      await new Promise((r) => setTimeout(r, 150))
      const call = await this.sessionService.getLatestModelCall(sessionId)
      if (call) {
        return {
          modelProvider: call.modelProvider,
          modelName: call.modelName,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          creditCost: call.creditCost,
          durationMs: call.durationMs ?? 0,
        }
      }
    } catch (err) {
      this.logger.warn(`读取模型调用统计失败：${(err as Error).message}`)
    }
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
