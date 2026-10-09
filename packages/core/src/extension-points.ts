import { Service } from 'cordis'
import type { StylePackContent } from '@novelagent/shared'

/**
 * 扩展点接口定义（文档 4.4）
 * 扩展点 = 插件向系统暴露能力的抽象类，Cordis Service 的具名子类
 */

/** 所有扩展点的基类：以 Cordis Service 形式注册到 Context */
export abstract class ExtensionPoint extends Service {
  /** 扩展点唯一标识（即注册的服务名） */
  abstract readonly extensionId: string
}

// ==================== 模型扩展点 ====================

/** 模型调用元数据（透传给计费/记录链路） */
export interface ModelCallMetadata {
  userId?: string
  sessionId?: string
  novelId?: string
  stylePackId?: string
}

export interface ModelRequest {
  prompt: string
  systemPrompt?: string
  /** 具体模型名（如 mock-v1 / gpt-4o） */
  model: string
  /** 提供者标识：'builtin' 或模型插件 id */
  providerId: string
  maxTokens?: number
  temperature?: number
  metadata?: ModelCallMetadata
  /**
   * 提供者私有配置（自定义模型用）：
   * 由 Web 层从 ModelConfig 解密注入（API Key 不落日志），插件 provider 直接消费
   */
  providerOptions?: ProviderOptions
}

/** 模型插件的连接参数 */
export interface ProviderOptions {
  apiKey?: string
  baseUrl?: string
  /** 覆盖请求使用的模型名 */
  model?: string
}

export interface ModelResponse {
  content: string
  inputTokens: number
  outputTokens: number
  model: string
  providerId: string
}

/** 模型扩展点：AI 模型提供者（文档 4.4 ModelProvider） */
export abstract class ModelProvider extends ExtensionPoint {
  abstract readonly providerId: string
  abstract readonly providerName: string
  /** 内置模型（消耗积分）还是用户自定义（自己的 Key，ADR-009） */
  abstract readonly isBuiltin: boolean
  abstract chat(request: ModelRequest): Promise<ModelResponse>
}

/** 模型服务最小接口（功能插件视角；完整实现在 @novelagent/model-service） */
export interface ModelServiceLike {
  chat(request: ModelRequest): Promise<ModelResponse & { creditCost: number; durationMs: number }>
}

// ==================== 功能扩展点 ====================

/** 模型选择（FeatureRequest.model） */
export interface ModelSelection {
  /** 'builtin' = 内置免费模型；其他 = 模型插件 id */
  providerId: string
  /** providerId 为模型插件时：用户模型配置 id（ModelConfig 表） */
  modelConfigId?: string
  /** 展示用模型名 */
  model: string
  /** 自定义模型的解密连接参数（Web 层注入，插件透传给 provider） */
  providerConfig?: ProviderOptions
}

/** 风格包上下文（FeatureRequest.stylePack，缺省时插件走内置兜底风格） */
export interface StylePackContext {
  id: string
  builtinKey: string | null
  name: string
  content: StylePackContent
}

/** 生成进度回调（由 Web 层注入，转发到 WebSocket，文档 2.2 实时性） */
export type ProgressEmitter = (
  stage: 'prompt' | 'model' | 'parse' | 'done' | 'error',
  progress: number,
  message: string,
) => void

/** 功能插件标准输入（文档待确认项"FeatureRequest 结构"的落地） */
export interface FeatureRequest {
  userId: string
  novelId: string
  sessionId?: string
  /** 功能特定输入，如 { idea: '一句话创意' } */
  input: Record<string, unknown>
  model: ModelSelection
  /** 小说当前主体风格包；undefined 表示未选择（插件按兼容性规则处理，PRD 3.5） */
  stylePack?: StylePackContext
  /** 已合并 schema 默认值的插件配置 */
  config: Record<string, unknown>
  /** 可选的进度上报 */
  emitProgress?: ProgressEmitter
}

export interface FeatureError {
  code: string
  message: string
}

/** 功能插件标准输出 */
export interface FeatureResult {
  success: boolean
  data?: unknown
  error?: FeatureError
}

/** 功能扩展点：创作功能模块（大纲生成/章节写作/润色/续写等） */
export abstract class FeatureExtensionPoint extends ExtensionPoint {
  abstract readonly featureId: string
  abstract readonly featureName: string
  abstract execute(request: FeatureRequest): Promise<FeatureResult>
}

// ==================== 风格生成扩展点（MVP 预留，不实现插件） ====================

export interface StyleGenerateRequest {
  userId: string
  sourceText: string
  options?: Record<string, unknown>
}

/** 风格生成扩展点（文档 4.4；基础提取为内置，高级提取由插件提供，PRD 3.4） */
export abstract class StyleGeneratorExtensionPoint extends ExtensionPoint {
  abstract readonly generatorId: string
  abstract readonly generatorName: string
  abstract generate(request: StyleGenerateRequest): Promise<StylePackContent>
}
