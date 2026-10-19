import { Injectable, Logger } from '@nestjs/common'
import { SERVICE_IDS, type ModelSelection } from '@novelagent/core'
import type { PluginInputField } from '@novelagent/shared'
import { ModelService } from '@novelagent/model-service'
import { CordisHost } from '../cordis.host'

/** 调度器可见的插件信息（manifest 子集） */
export interface DispatchPluginInfo {
  pluginId: string
  displayName: string
  description?: string
  type: 'FEATURE' | 'STYLE_GENERATOR'
  inputSchema: PluginInputField[]
}

export interface DispatchContext {
  userId: string
  message: string
  /** 附件全文（已按上限截断）；无附件为 undefined */
  attachmentText?: string
  attachmentName?: string
  /** 当前小说标题（上下文提示用） */
  novelTitle?: string
  /** 近期对话历史（含当前消息） */
  history: Array<{ role: 'USER' | 'ASSISTANT'; content: string }>
  /** 可用插件 */
  plugins: DispatchPluginInfo[]
  /** 所选模型：builtin 为内置演示模型；自定义模型走真实 LLM 对话 */
  model: ModelSelection
}

export type DispatchDecision =
  | { action: 'execute'; pluginId: string; input: Record<string, unknown> }
  | { action: 'reply'; message: string }

/** 附件送入对话上下文的最大长度（执行插件时才用全文） */
const CONTEXT_ATTACHMENT_CHARS = 4000

/** 常规对话历史条数上限 */
const CONTEXT_HISTORY_MESSAGES = 12

/** 内置演示模型为纯 mock（仅支持大纲/风格任务标记），无法进行常规对话，返回引导说明 */
const BUILTIN_CHAT_REPLY = [
  '当前使用内置演示模型，仅支持通过插件生成大纲、提取风格，暂不支持常规对话。',
  '你可以：点击输入框下方「插件」按钮选择一个创作插件；或在「模型设置」配置自定义模型后，切换为「自定义」再与我对话。',
].join('\n')

/**
 * 对话调度器（插件由用户显式选择，不再做自动意图路由）：
 * - dispatchForPlugin：用户选择了插件 → 按 inputSchema 组装输入直接执行；缺必要输入转为追问回复
 * - chat：未选择插件 → 按常规对话处理（自定义模型走真实 LLM；内置演示模型返回引导说明）
 */
@Injectable()
export class ChatDispatcherService {
  private readonly logger = new Logger('ChatDispatcher')

  constructor(private readonly cordisHost: CordisHost) {}

  /** 用户显式选择插件：组装输入直接执行；插件不可用或缺必要输入时转为回复 */
  dispatchForPlugin(ctx: DispatchContext, pluginId: string): DispatchDecision {
    const target = ctx.plugins.find((p) => p.pluginId === pluginId)
    if (!target) {
      return {
        action: 'reply',
        message: `插件「${pluginId}」当前不可用（未启用或未运行），请到「插件管理」检查后重试。`,
      }
    }
    return (
      this.buildInput(target, ctx) ?? {
        action: 'reply',
        message: `请补充「${target.displayName}」需要的信息后重试。`,
      }
    )
  }

  /** 常规对话：自定义模型走真实 LLM；内置演示模型返回引导说明 */
  async chat(ctx: DispatchContext): Promise<DispatchDecision> {
    if (ctx.model.providerId === 'builtin') {
      return { action: 'reply', message: BUILTIN_CHAT_REPLY }
    }
    try {
      const modelService = this.cordisHost.get<ModelService>(SERVICE_IDS.MODEL)
      if (!modelService) throw new Error('model-service 不可用')

      const attachmentBrief = ctx.attachmentText
        ? `\n\n【附件：${ctx.attachmentName}（${ctx.attachmentText.length} 字）】\n${ctx.attachmentText.slice(0, CONTEXT_ATTACHMENT_CHARS)}`
        : ''
      // history 已含刚入库的当前用户消息，直接作为对话正文
      const historyText = ctx.history
        .slice(-CONTEXT_HISTORY_MESSAGES)
        .map((m) => `${m.role === 'USER' ? '用户' : '助手'}：${m.content}`)
        .join('\n\n')

      const systemPrompt = [
        '你是 NovelAgent 的 AI 创作助手，正在与小说作者进行常规对话：帮助构思剧情、解答创作疑问、头脑风暴、润色文字。',
        '直接用中文自然回复，不要输出 JSON 或任何调用协议。',
        ctx.novelTitle ? `当前小说：《${ctx.novelTitle}》。` : '',
      ].join('')

      const result = await modelService.chat({
        prompt: `${historyText}${attachmentBrief}`,
        systemPrompt,
        model: ctx.model.model,
        providerId: ctx.model.providerId,
        providerOptions: ctx.model.providerConfig,
        metadata: { userId: ctx.userId },
      })
      const content = result.content.trim()
      return { action: 'reply', message: content || '（模型未返回内容，请重试）' }
    } catch (err) {
      this.logger.warn(`对话模型调用失败：${(err as Error).message}`)
      return { action: 'reply', message: `模型调用失败：${(err as Error).message}，请检查模型配置后重试。` }
    }
  }

  /** 按 inputSchema 组装插件输入；缺必要输入返回 undefined（追问） */
  private buildInput(plugin: DispatchPluginInfo, ctx: DispatchContext): DispatchDecision | undefined {
    const input: Record<string, unknown> = {}
    for (const field of plugin.inputSchema) {
      if (field.type === 'file') {
        if (ctx.attachmentText) {
          input[field.key] = ctx.attachmentText
        } else if (field.required) {
          return {
            action: 'reply',
            message: `使用「${plugin.displayName}」需要提供${field.name}，请点击输入框左侧附件按钮上传 ${field.fileAccept ?? '.txt'} 文件后重试。`,
          }
        }
      } else if (ctx.message.trim()) {
        input[field.key] = ctx.message.trim()
      } else if (field.required) {
        return {
          action: 'reply',
          message: `请补充「${plugin.displayName}」需要的信息：${field.name}${field.description ? `（${field.description}）` : ''}`,
        }
      }
    }
    if (Object.keys(input).length === 0) input.message = ctx.message
    return { action: 'execute', pluginId: plugin.pluginId, input }
  }
}
