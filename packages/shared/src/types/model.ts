/** 用户自定义模型配置（API Key 脱敏后返回前端） */
export interface ModelConfigDto {
  id: string
  /** 来源模型插件记录 id */
  installedPluginId: string
  installedPluginName: string | null
  name: string
  baseUrl: string | null
  /** 脱敏显示，如 sk-****abcd */
  apiKeyMasked: string
  modelName: string
  isDefault: boolean
  createdAt: string
}

export interface CreateModelConfigRequest {
  installedPluginId: string
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
