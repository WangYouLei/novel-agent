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
  /** 调度所用模型：builtin 走本地规则（零积分成本）；自定义走 LLM */
  model: ModelSelection
}

export type DispatchDecision =
  | { action: 'execute'; pluginId: string; input: Record<string, unknown> }
  | { action: 'reply'; message: string }

/** 内置模型下的关键词路由表（mock 模型不具备真实意图识别能力，用规则替代） */
const KEYWORD_ROUTES: Array<{ pluginId: string; pattern: RegExp }> = [
  { pluginId: 'style-generator', pattern: /风格|文风|笔触|语感|提取.*小说/i },
  { pluginId: 'outline-generator', pattern: /大纲|目录|章节规划|outline/i },
]

/** 附件送入 LLM 调度上下文的最大长度（执行时才用全文） */
const DISPATCH_ATTACHMENT_CHARS = 4000

/**
 * 对话调度器：把用户自然语言 + 附件决策为「调用某插件」或「直接回复」
 * - 自定义模型：LLM 意图识别（用户自己的 Key，不计积分）
 * - 内置模型：本地关键词规则（避免为调度本身消耗积分）
 */
@Injectable()
export class ChatDispatcherService {
  private readonly logger = new Logger('ChatDispatcher')

  constructor(private readonly cordisHost: CordisHost) {}

  async dispatch(ctx: DispatchContext): Promise<DispatchDecision> {
    if (ctx.model.providerId === 'builtin') {
      return this.dispatchByRule(ctx)
    }
    try {
      return await this.dispatchByLLM(ctx)
    } catch (err) {
      this.logger.warn(`LLM 调度失败，回退规则路由：${(err as Error).message}`)
      return this.dispatchByRule(ctx)
    }
  }

  /** 本地规则路由（内置模型/LLM 失败兜底） */
  private dispatchByRule(ctx: DispatchContext): DispatchDecision {
    const text = ctx.message
    // 1. 显式点名插件 id / 名称优先
    let target = ctx.plugins.find(
      (p) => text.includes(p.pluginId) || text.includes(p.displayName),
    )
    // 2. 关键词表
    if (!target) {
      for (const route of KEYWORD_ROUTES) {
        if (route.pattern.test(text)) {
          target = ctx.plugins.find((p) => p.pluginId === route.pluginId)
          if (target) break
        }
      }
    }
    if (!target) return { action: 'reply', message: this.capabilitiesReply(ctx.plugins) }

    return this.buildInput(target, ctx) ?? { action: 'reply', message: this.capabilitiesReply(ctx.plugins) }
  }

  /** LLM 路由：组装插件清单与输出协议，解析 JSON 决策 */
  private async dispatchByLLM(ctx: DispatchContext): Promise<DispatchDecision> {
    const modelService = this.cordisHost.get<ModelService>(SERVICE_IDS.MODEL)
    if (!modelService) throw new Error('model-service 不可用')

    const attachmentBrief = ctx.attachmentText
      ? `\n\n【附件：${ctx.attachmentName}（${ctx.attachmentText.length} 字）】\n${ctx.attachmentText.slice(0, DISPATCH_ATTACHMENT_CHARS)}`
      : ''

    const history = ctx.history
      .slice(-8)
      .map((m) => `${m.role === 'USER' ? '用户' : '助手'}：${m.content.slice(0, 500)}`)
      .join('\n')

    const systemPrompt = [
      '你是 NovelAgent 的对话调度助手。用户用自然语言下达创作指令，你决定调用哪个插件或直接回复。',
      '',
      '## 可用插件',
      JSON.stringify(
        ctx.plugins.map((p) => ({
          pluginId: p.pluginId,
          名称: p.displayName,
          说明: p.description,
          输入: p.inputSchema,
        })),
      ),
      ctx.novelTitle ? `\n## 用户上下文\n当前小说：《${ctx.novelTitle}》` : '',
      '',
      '## 输出协议',
      '只输出一个 JSON 对象，不要任何其他文字或代码围栏：',
      '- 调用插件：{"action":"execute","pluginId":"插件id","input":{"字段key":"值"}}',
      '  input 的 key 必须严格按插件「输入」schema 填写；file 类型字段填附件文本原文',
      '- 直接回复（闲聊/咨询/缺少必要信息需追问）：{"action":"reply","message":"回复内容"}',
    ].join('\n')

    const result = await modelService.chat({
      prompt: `${history ? `## 对话历史\n${history}\n\n` : ''}## 用户最新消息\n${ctx.message}${attachmentBrief}`,
      systemPrompt,
      model: ctx.model.model,
      providerId: ctx.model.providerId,
      providerOptions: ctx.model.providerConfig,
      metadata: { userId: ctx.userId },
    })

    return this.parseDecision(result.content, ctx)
  }

  /** 解析 LLM 输出为决策（非法 pluginId / 缺字段回退规则路由） */
  private parseDecision(raw: string, ctx: DispatchContext): DispatchDecision {
    const json = extractJson(raw)
    if (!json) throw new Error('LLM 输出无法解析为 JSON')
    if (json.action === 'reply' && typeof json.message === 'string' && json.message.trim()) {
      return { action: 'reply', message: json.message.trim() }
    }
    if (json.action === 'execute' && typeof json.pluginId === 'string') {
      const target = ctx.plugins.find((p) => p.pluginId === json.pluginId)
      if (target && json.input && typeof json.input === 'object') {
        return { action: 'execute', pluginId: target.pluginId, input: json.input as Record<string, unknown> }
      }
    }
    throw new Error(`LLM 决策不可执行：${raw.slice(0, 200)}`)
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

  /** 能力清单回复（未命中任何插件时） */
  private capabilitiesReply(plugins: DispatchPluginInfo[]): string {
    if (plugins.length === 0) {
      return '当前没有可用的创作插件，请先到「插件管理」启用插件后再来对话。'
    }
    const lines = plugins.map(
      (p) => `- ${p.displayName}：${p.description ?? '无描述'}（输入：${p.inputSchema.map((f) => f.name).join('、') || '无'}）`,
    )
    return `我可以帮你调用以下创作能力，直接用一句话描述需求即可：\n${lines.join('\n')}`
  }
}

/** 从 LLM 输出中提取 JSON 对象（容忍围栏与前后缀文本） */
function extractJson(raw: string): Record<string, unknown> | undefined {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : raw
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return undefined
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return undefined
  }
}
