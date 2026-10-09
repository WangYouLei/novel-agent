import type { OutlineStructure } from './outline'

/** 大纲生成请求（PRD 5.2 核心链路） */
export interface GenerateOutlineRequest {
  novelId: string
  /** 一句话创意 */
  idea: string
  /** 'builtin' = 内置免费模型（消耗积分）；其他 = 模型插件 id（用户自己的 Key） */
  providerId: string
  /** providerId 为模型插件时，用户模型配置 id */
  modelConfigId?: string
  /** 用户在 UI 上临时覆盖的插件参数（不改持久化配置） */
  pluginConfig?: Record<string, unknown>
}

export interface ModelCallSummary {
  modelProvider: string
  modelName: string
  inputTokens: number
  outputTokens: number
  /** 本次消耗积分（自定义模型为 0） */
  creditCost: number
  durationMs: number
}

export interface GenerateOutlineResponse {
  sessionId: string
  outline: OutlineStructure
  modelCall: ModelCallSummary
}

/** WebSocket 生成进度事件 payload（Socket.IO /plugin-bridge 推送） */
export interface GenerationProgressPayload {
  sessionId: string
  novelId: string
  /** 阶段：prompt 构建中 / 模型调用中 / 解析中 */
  stage: 'prompt' | 'model' | 'parse' | 'done' | 'error'
  /** 0-100 */
  progress: number
  message: string
}

/** Bridge Socket.IO 事件名约定（前后端共享） */
export const BRIDGE_EVENTS = {
  /** 后端 → 前端：生成进度 */
  GENERATION_PROGRESS: 'generation-progress',
  /** 前端 → 后端：服务调用（Bridge 插件） */
  SERVICE_CALL: 'service-call',
  /** 双向：插件事件 */
  PLUGIN_EVENT: 'plugin-event',
} as const
