/** 系统内置的模型厂商预设（OpenAI 兼容接口，model-service 固定能力，非插件） */
export interface SystemModelProviderDto {
  /** 厂商标识，如 'openai' / 'deepseek' / 'qwen' / 'glm' */
  providerId: string
  /** 显示名，如 'DeepSeek' */
  providerName: string
  /** OpenAI 兼容接口默认地址 */
  defaultBaseUrl: string
  /** 常用模型名（前端下拉建议，可自由输入其他值） */
  models: string[]
  /** 默认选中的模型名 */
  defaultModel: string
  /** API Key 申请提示 */
  keyHint: string
}

/** 用户自定义模型配置（API Key 脱敏后返回前端） */
export interface ModelConfigDto {
  id: string
  /** 来源：系统厂商预设 id 或第三方模型插件 id */
  providerId: string
  providerName: string | null
  name: string
  baseUrl: string | null
  /** 脱敏显示，如 sk-****abcd */
  apiKeyMasked: string
  modelName: string
  isDefault: boolean
  createdAt: string
}

export interface CreateModelConfigRequest {
  /** 系统厂商预设 id 或第三方模型插件 id */
  providerId: string
  name: string
  baseUrl?: string
  apiKey: string
  modelName: string
  isDefault?: boolean
}

export interface UpdateModelConfigRequest {
  name?: string
  baseUrl?: string
  /** 不传表示不修改 Key */
  apiKey?: string
  modelName?: string
  isDefault?: boolean
}

/** 内置免费模型信息（mock） */
export interface BuiltinModelDto {
  providerId: 'builtin'
  modelId: string
  displayName: string
  billingType: 'CREDIT'
}
