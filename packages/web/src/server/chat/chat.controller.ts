import { Body, Controller, Get, Logger, Param, Post, UseGuards } from '@nestjs/common'
import {
  ChatService,
  ModelConfigService,
  NovelService,
  PluginRegistryService,
  SessionService,
  StylePackService,
} from '@novelagent/application'
import type {
  FeatureExtensionPoint,
  ModelSelection,
  StyleGeneratorExtensionPoint,
} from '@novelagent/core'
import {
  BizError,
  ErrorCode,
  LIMITS,
  type ChatAttachmentMeta,
  type ChatMessageDto,
  type ChatSessionDto,
  type ChatToolCall,
  type CreateChatSessionRequest,
  type OutlineStructure,
  type SendChatMessageRequest,
  type SendChatMessageResponse,
} from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { CordisHost } from '../cordis.host'
import { BridgeGateway } from '../gateway/bridge.gateway'
import { ChatDispatcherService, type DispatchPluginInfo } from './chat-dispatcher.service'

/** 插件执行结果（assistant 消息 + 结果卡片元数据） */
interface ExecOutcome {
  toolCall: ChatToolCall
  content: string
}

/**
 * 对话式插件入口（方案 B）：
 * 用户在对话框输入指令/附件 → 调度器决策 → 通用执行任意 FEATURE / STYLE_GENERATOR 插件
 * 第三方插件只需在 manifest 声明 inputSchema，无需编写任何前端代码即可被对话调用
 */
@Controller('api/chat')
@UseGuards(JwtGuard)
export class ChatController {
  private readonly logger = new Logger('Chat')

  constructor(
    private readonly chatService: ChatService,
    private readonly novelService: NovelService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly modelConfigService: ModelConfigService,
    private readonly stylePackService: StylePackService,
    private readonly sessionService: SessionService,
    private readonly cordisHost: CordisHost,
    private readonly gateway: BridgeGateway,
    private readonly dispatcher: ChatDispatcherService,
  ) {}

  @Post('sessions')
  async createSession(
    @CurrentUser() userId: string,
    @Body() body: CreateChatSessionRequest,
  ): Promise<ChatSessionDto> {
    if (body.novelId) {
      // 校验小说归属（大纲等插件需挂载到小说下）
      await this.novelService.getById(userId, body.novelId)
    }
    const session = await this.chatService.createSession(userId, body.novelId)
    return this.toSessionDto(session)
  }

  @Get('sessions')
  async listSessions(@CurrentUser() userId: string): Promise<ChatSessionDto[]> {
    const sessions = await this.chatService.listSessions(userId)
    return sessions.map((s) => this.toSessionDto(s))
  }

  @Get('sessions/:id/messages')
  async listMessages(
    @CurrentUser() userId: string,
    @Param('id') sessionId: string,
  ): Promise<ChatMessageDto[]> {
    const messages = await this.chatService.listMessages(userId, sessionId)
    return messages.map((m) => this.toMessageDto(m))
  }

  /** 发送消息：存用户消息 → 调度决策 → 执行插件/回复 → 存助手消息 */
  @Post('sessions/:id/messages')
  async send(
    @CurrentUser() userId: string,
    @Param('id') sessionId: string,
    @Body() body: SendChatMessageRequest,
  ): Promise<SendChatMessageResponse> {
    const content = (body.content ?? '').trim()
    const attachmentText = body.attachment?.text?.slice(0, LIMITS.CHAT_ATTACHMENT_MAX_CHARS)
    if (!content && !attachmentText) {
      throw new BizError(ErrorCode.BAD_REQUEST, '消息内容不能为空')
    }
    if (content.length > LIMITS.CHAT_MESSAGE_MAX_LENGTH) {
      throw new BizError(ErrorCode.BAD_REQUEST, `消息不能超过 ${LIMITS.CHAT_MESSAGE_MAX_LENGTH} 字`)
    }

    const session = await this.chatService.getSession(userId, sessionId)
    const attachments: ChatAttachmentMeta[] | undefined = attachmentText
      ? [{ name: body.attachment!.name, chars: attachmentText.length }]
      : undefined
    const userMessage = await this.chatService.appendMessage({
      sessionId,
      role: 'USER',
      content,
      attachments,
    })

    // 调度（插件清单 + 模型 + 对话历史）
    const plugins = await this.collectPlugins(userId)
    const model = await this.resolveModelSelection(userId, body)
    const history = await this.chatService.recentMessages(userId, sessionId)

    let toolCall: ChatToolCall | undefined
    let replyText: string
    try {
      const decision = await this.dispatcher.dispatch({
        userId,
        message: content,
        attachmentText,
        attachmentName: body.attachment?.name,
        novelTitle: session.novel?.title,
        history: history.map((m) => ({ role: m.role as 'USER' | 'ASSISTANT', content: m.content })),
        plugins,
        model,
      })

      if (decision.action === 'reply') {
        replyText = decision.message
      } else {
        const plugin = plugins.find((p) => p.pluginId === decision.pluginId)!
        try {
          const outcome =
            plugin.type === 'FEATURE'
              ? await this.executeFeature({
                  userId,
                  pluginId: plugin.pluginId,
                  pluginName: plugin.displayName,
                  input: decision.input,
                  model,
                  novelId: session.novelId,
                })
              : await this.executeStyleGenerator({
                  userId,
                  pluginId: plugin.pluginId,
                  pluginName: plugin.displayName,
                  input: decision.input,
                  model,
                  attachmentName: body.attachment?.name,
                })
          toolCall = outcome.toolCall
          replyText = outcome.content
        } catch (err) {
          this.logger.warn(`插件执行失败：${(err as Error).message}`)
          toolCall = {
            pluginId: plugin.pluginId,
            pluginName: plugin.displayName,
            status: 'FAILED',
            input: summarizeInput(decision.input),
            error: (err as Error).message,
          }
          replyText = `「${plugin.displayName}」执行失败：${(err as Error).message}`
        }
      }
    } catch (err) {
      // 调度本身失败（如自定义模型不可达）转为普通回复
      this.logger.warn(`调度失败：${(err as Error).message}`)
      replyText = `调度失败：${(err as Error).message}，请重试或换一种描述。`
    }

    const assistantMessage = await this.chatService.appendMessage({
      sessionId,
      role: 'ASSISTANT',
      content: replyText,
      toolCall,
    })
    return {
      userMessage: this.toMessageDto(userMessage),
      assistantMessage: this.toMessageDto(assistantMessage),
    }
  }

  /** 收集用户可用（启用 + 运行中）的功能/风格生成插件 */
  private async collectPlugins(userId: string): Promise<DispatchPluginInfo[]> {
    const records = await this.pluginRegistry.listForUser(userId)
    const enabled = new Set(records.filter((r) => r.enabled).map((r) => r.pluginId))
    const plugins: DispatchPluginInfo[] = []
    for (const runtime of this.cordisHost.runtimes.values()) {
      if (runtime.status !== 'STARTED' || runtime.manifest.type === 'MODEL') continue
      if (!enabled.has(runtime.manifest.pluginId)) continue
      plugins.push({
        pluginId: runtime.manifest.pluginId,
        displayName: runtime.manifest.displayName,
        description: runtime.manifest.description,
        type: runtime.manifest.type,
        inputSchema: runtime.manifest.inputSchema,
      })
    }
    return plugins
  }

  /** 通用 FEATURE 插件执行（编排逻辑与 WritingController 一致，sessionType=CUSTOM） */
  private async executeFeature(params: {
    userId: string
    pluginId: string
    pluginName: string
    input: Record<string, unknown>
    model: ModelSelection
    novelId: string | null
  }): Promise<ExecOutcome> {
    const { userId, pluginId, input, model, novelId } = params
    if (!novelId) {
      throw new BizError(ErrorCode.CHAT_FAILED, '该对话未关联小说，请新建对话并选择小说')
    }

    const pluginRecord = await this.pluginRegistry.getByPluginId(userId, pluginId)
    if (!pluginRecord.enabled) {
      throw new BizError(ErrorCode.PLUGIN_NOT_ENABLED, `插件「${params.pluginName}」已被禁用`)
    }
    const runtime = this.cordisHost.runtimes.get(pluginId)
    if (!runtime || runtime.status !== 'STARTED') {
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, `插件「${params.pluginName}」不可用`)
    }
    const feature = this.cordisHost.getFeature<FeatureExtensionPoint>(pluginId)
    if (!feature) {
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, `缺少「${params.pluginName}」能力`)
    }

    const config = this.pluginRegistry.applyDefaults(
      runtime.manifest.configSchema,
      (pluginRecord.config as Record<string, unknown>) ?? {},
    )
    const stylePack = await this.stylePackService.getForNovel(novelId)
    const sessionId = await this.sessionService.createSession({
      userId,
      novelId,
      sessionType: 'CUSTOM',
      featurePluginId: pluginId,
      inputSummary: JSON.stringify(summarizeInput(input)),
    })

    this.logger.log(`对话执行插件 ${pluginId}：用户=${userId} 模型=${model.model}`)
    const result = await feature.execute({
      userId,
      novelId,
      sessionId,
      input,
      model,
      stylePack: stylePack
        ? {
            id: stylePack.id,
            builtinKey: stylePack.builtinKey,
            name: stylePack.name,
            content: stylePack.content,
          }
        : undefined,
      config,
      emitProgress: (stage, progress, message) => {
        this.gateway.pushProgress(userId, { sessionId, novelId, stage, progress, message })
      },
    })
    if (!result.success || !result.data) {
      await this.sessionService.finishSession(sessionId, 'FAILED', result.error?.message)
      const error = result.error ?? { code: 'GENERATION_FAILED', message: '执行失败' }
      throw new BizError(ErrorCode.GENERATION_FAILED, `[${error.code}] ${error.message}`)
    }
    await this.sessionService.finishSession(sessionId, 'COMPLETED')

    const toolCall: ChatToolCall = {
      pluginId,
      pluginName: params.pluginName,
      status: 'SUCCESS',
      input: summarizeInput(input),
    }
    // 大纲形结构 → 结果卡片（前端可预览并保存到小说）
    const outline = asOutlineStructure(result.data)
    if (outline) {
      toolCall.resultKind = 'outline'
      toolCall.result = outline
      return {
        toolCall,
        content: `已生成《${outline.title}》大纲（${outline.chapters.length} 章）：${outline.logline}\n\n可在下方卡片预览并保存到小说。`,
      }
    }
    return { toolCall, content: `「${params.pluginName}」执行成功。` }
  }

  /** 通用 STYLE_GENERATOR 插件执行（生成后保存为用户风格包） */
  private async executeStyleGenerator(params: {
    userId: string
    pluginId: string
    pluginName: string
    input: Record<string, unknown>
    model: ModelSelection
    attachmentName?: string
  }): Promise<ExecOutcome> {
    const { userId, pluginId, input, model } = params
    const sourceText = typeof input.sourceText === 'string' ? input.sourceText : ''
    if (!sourceText.trim()) {
      throw new BizError(ErrorCode.BAD_REQUEST, '缺少小说文本，请上传 .txt/.md 附件')
    }

    const pluginRecord = await this.pluginRegistry.getByPluginId(userId, pluginId)
    if (!pluginRecord.enabled) {
      throw new BizError(ErrorCode.PLUGIN_NOT_ENABLED, `插件「${params.pluginName}」已被禁用`)
    }
    const runtime = this.cordisHost.runtimes.get(pluginId)
    if (!runtime || runtime.status !== 'STARTED') {
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, `插件「${params.pluginName}」不可用`)
    }
    const generator = this.cordisHost.get<StyleGeneratorExtensionPoint>(pluginId)
    if (!generator) {
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, `缺少「${params.pluginName}」能力`)
    }

    const config = this.pluginRegistry.applyDefaults(
      runtime.manifest.configSchema,
      (pluginRecord.config as Record<string, unknown>) ?? {},
    )

    this.logger.log(`对话执行插件 ${pluginId}：用户=${userId} 文本=${sourceText.length} 字`)
    const content = await generator.generate({
      userId,
      sourceText,
      options: { model, ...config },
    })
    const name = params.attachmentName?.replace(/\.[^.]+$/, '') || '对话提取风格包'
    const pack = await this.stylePackService.createGenerated(userId, name, content, pluginId)
    this.logger.log(`对话风格生成完成：pack=${pack.id}`)

    return {
      toolCall: {
        pluginId,
        pluginName: params.pluginName,
        status: 'SUCCESS',
        input: summarizeInput(input),
        resultKind: 'stylePack',
        stylePackId: pack.id,
      },
      content: `已从「${name}」提取风格包「${pack.name}」，可在风格包页面查看和使用。`,
    }
  }

  /** 模型选择：builtin（规则调度，不耗积分）或自定义配置（LLM 调度，用户自己的 Key） */
  private async resolveModelSelection(
    userId: string,
    body: SendChatMessageRequest,
  ): Promise<ModelSelection> {
    if (!body.providerId || body.providerId === 'builtin') {
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
        `模型插件 [${config.pluginId}] 已禁用，请先启用`,
      )
    }
    const runtime = this.cordisHost.runtimes.get(config.pluginId)
    if (!runtime || runtime.status !== 'STARTED') {
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

  private toSessionDto(s: {
    id: string
    novelId: string | null
    title: string
    createdAt: Date
    updatedAt: Date
    novel: { title: string } | null
  }): ChatSessionDto {
    return {
      id: s.id,
      novelId: s.novelId,
      novelTitle: s.novel?.title ?? null,
      title: s.title,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  }

  private toMessageDto(m: {
    id: string
    sessionId: string
    role: string
    content: string
    attachments: unknown
    toolCall: unknown
    createdAt: Date
  }): ChatMessageDto {
    return {
      id: m.id,
      sessionId: m.sessionId,
      role: m.role as 'USER' | 'ASSISTANT',
      content: m.content,
      attachments: (m.attachments as ChatAttachmentMeta[] | null) ?? null,
      toolCall: (m.toolCall as ChatToolCall | null) ?? null,
      createdAt: m.createdAt.toISOString(),
    }
  }
}

/** 长文本输入摘要化（toolCall.input 不落全文） */
function summarizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    out[key] =
      typeof value === 'string' && value.length > 200
        ? `${value.slice(0, 200)}…（共 ${value.length} 字）`
        : value
  }
  return out
}

/** 形判大纲结构（第三方大纲类插件产出同结构时同样可渲染卡片） */
function asOutlineStructure(data: unknown): OutlineStructure | undefined {
  if (data && typeof data === 'object') {
    const d = data as { logline?: unknown; chapters?: unknown }
    if (typeof d.logline === 'string' && Array.isArray(d.chapters) && d.chapters.length > 0) {
      return data as OutlineStructure
    }
  }
  return undefined
}
