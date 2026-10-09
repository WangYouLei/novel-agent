import { Body, Controller, Delete, Get, Logger, Param, Post, Put, UseGuards } from '@nestjs/common'
import {
  ModelConfigService,
  PluginRegistryService,
  StylePackService,
} from '@novelagent/application'
import type {
  StyleGeneratorExtensionPoint,
  ModelSelection,
} from '@novelagent/core'
import {
  BizError,
  ErrorCode,
  LIMITS,
  type GenerateStylePackRequest,
  type StylePackDto,
  type UpdateStylePackRequest,
} from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { CordisHost } from '../cordis.host'

/** 风格生成插件 id（首个 STYLE_GENERATOR 插件） */
const STYLE_PLUGIN_ID = 'style-generator'

/**
 * 风格包控制器：三级供给体系（PRD 3.3）——内置只读可复制、用户自建可改可删
 * generate 端点：上传小说 → style-generator 插件分析 → 保存为用户风格包（PRD 3.4）
 */
@Controller('api/style-packs')
@UseGuards(JwtGuard)
export class StylePackController {
  private readonly logger = new Logger('StylePack')

  constructor(
    private readonly stylePackService: StylePackService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly modelConfigService: ModelConfigService,
    private readonly cordisHost: CordisHost,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string): Promise<StylePackDto[]> {
    return this.stylePackService.list(userId)
  }

  @Get(':id')
  async getById(@CurrentUser() userId: string, @Param('id') id: string): Promise<StylePackDto> {
    return this.stylePackService.getById(userId, id)
  }

  /** 上传小说生成风格包：组装选项（模型/插件配置）→ 调用风格生成插件 → 落库返回 */
  @Post('generate')
  async generate(
    @CurrentUser() userId: string,
    @Body() body: GenerateStylePackRequest,
  ): Promise<StylePackDto> {
    // 1. 基础校验
    const sourceText = (body.sourceText ?? '').trim()
    if (!sourceText) throw new BizError(ErrorCode.BAD_REQUEST, '小说文本不能为空')
    if (sourceText.length > LIMITS.STYLE_SOURCE_MAX_LENGTH) {
      throw new BizError(
        ErrorCode.BAD_REQUEST,
        `小说文本不能超过 ${LIMITS.STYLE_SOURCE_MAX_LENGTH} 字`,
      )
    }

    // 2. 插件可用性检查（禁用/依赖缺失时给出明确提示）
    const pluginRecord = await this.pluginRegistry.getByPluginId(userId, STYLE_PLUGIN_ID)
    if (!pluginRecord.enabled) {
      throw new BizError(
        ErrorCode.PLUGIN_NOT_ENABLED,
        '风格生成插件已被禁用，请先在插件管理中启用',
      )
    }
    const runtime = this.cordisHost.runtimes.get(STYLE_PLUGIN_ID)
    if (!runtime || runtime.status !== 'STARTED') {
      const detail =
        runtime?.status === 'DEPENDENCY_MISSING'
          ? `缺少依赖：${runtime.missing?.join(', ')}`
          : runtime?.errorMessage ?? '插件未加载'
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, `风格生成插件不可用（${detail}）`)
    }
    const generator = this.cordisHost.get<StyleGeneratorExtensionPoint>(STYLE_PLUGIN_ID)
    if (!generator) {
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, '缺少风格生成能力，请检查插件状态')
    }

    // 3. 组装插件选项（模型选择 + 合并 schema 默认值的插件配置）
    const model = await this.resolveModelSelection(userId, body)
    const mergedConfig = this.pluginRegistry.applyDefaults(
      runtime.manifest.configSchema,
      (pluginRecord.config as Record<string, unknown>) ?? {},
    )
    const config = { ...mergedConfig, ...(body.pluginConfig ?? {}) }

    // 4. 执行插件并保存为用户风格包
    this.logger.log(`风格生成开始：用户=${userId} 文本=${sourceText.length} 字 模型=${model.model}`)
    const content = await generator.generate({
      userId,
      sourceText,
      options: { model, ...config },
    })

    const name = (body.name ?? '').trim() || '上传小说风格包'
    const pack = await this.stylePackService.createGenerated(userId, name, content, STYLE_PLUGIN_ID)
    this.logger.log(`风格生成完成：pack=${pack.id}`)
    return pack
  }

  /** 解析模型选择：内置免费（mock）或用户自定义配置（解密注入） */
  private async resolveModelSelection(
    userId: string,
    body: GenerateStylePackRequest,
  ): Promise<ModelSelection> {
    if (body.providerId === 'builtin') {
      return { providerId: 'builtin', model: 'mock-v1' }
    }

    if (!body.modelConfigId) {
      throw new BizError(ErrorCode.BAD_REQUEST, '使用自定义模型时必须选择模型配置')
    }
    const config = await this.modelConfigService.getDecrypted(userId, body.modelConfigId)

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
      providerConfig: {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl ?? undefined,
        model: config.modelName,
      },
    }
  }

  @Put(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: UpdateStylePackRequest,
  ): Promise<StylePackDto> {
    return this.stylePackService.update(userId, id, body)
  }

  /** 复制内置风格包为可编辑副本（PRD 3.3"可复制后修改"） */
  @Post(':id/fork')
  async fork(@CurrentUser() userId: string, @Param('id') id: string): Promise<StylePackDto> {
    return this.stylePackService.fork(userId, id)
  }

  @Delete(':id')
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.stylePackService.remove(userId, id)
  }
}
