import type { Context } from 'cordis'
import type { OutlineStructure } from '@novelagent/shared'

/**
 * 全局事件类型（文档 4.5：声明合并实现全链路类型安全）
 * 注意：泛型签名必须与 cordis 原声明一致（C extends Context = Context）
 */

export interface OutlineGeneratedEvent {
  userId: string
  novelId: string
  sessionId: string
  outline: OutlineStructure
  /** 生成所用插件 id */
  pluginId: string
}

export interface PluginStatusChangedEvent {
  pluginId: string
  enabled: boolean
}

/** 一次模型调用的完整信息（Web 层订阅后写入 model_call 表，摘要化存储） */
export interface ModelCallFinishedEvent {
  userId: string
  sessionId: string
  providerId: string
  model: string
  /** 原始输入/输出文本（记录层负责截断，ADR-011） */
  input: string
  output: string
  inputTokens: number
  outputTokens: number
  creditCost: number
  durationMs: number
  status: 'SUCCESS' | 'FAILED'
  errorMessage?: string
}

export interface StylePackChangedEvent {
  novelId: string
  stylePackId: string | null
}

declare module 'cordis' {
  interface Events<C extends Context = Context> {
    /** 大纲生成完成（文档 4.5 事件示例） */
    'outline-generated'(data: OutlineGeneratedEvent): void
    /** 插件启用/禁用状态变化（UI 状态实时刷新） */
    'plugin-status-changed'(data: PluginStatusChangedEvent): void
    /** 一次模型调用结束（计费/记录，Web 层订阅写库） */
    'model-call-finished'(data: ModelCallFinishedEvent): void
    /** 小说主体风格包切换 */
    'style-pack-changed'(data: StylePackChangedEvent): void
  }
}
