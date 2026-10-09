export type PluginTypeDto = 'FEATURE' | 'MODEL' | 'STYLE_GENERATOR'
export type PluginSourceDto = 'BUILTIN' | 'LOCAL' | 'MARKETPLACE'

/** 插件运行时状态（DB 的 PluginStatus + 依赖检测结果合成） */
export type PluginRuntimeStatus =
  | 'STARTED' // 已加载运行
  | 'STOPPED' // 被禁用/未加载
  | 'ERROR' // 加载失败
  | 'DEPENDENCY_MISSING' // 依赖缺失（PRD 5.4）

/** 插件配置参数 schema 字段（UI 依据此动态渲染表单，PRD 4.2） */
export interface PluginConfigField {
  key: string
  name: string
  type: 'string' | 'number' | 'boolean' | 'select'
  default?: unknown
  min?: number
  max?: number
  /** type=select 时的可选值 */
  enum?: string[]
  description?: string
}

/** 插件运行时输入 schema 字段（Chat 调度器依据此组装/校验插件输入） */
export interface PluginInputField {
  key: string
  name: string
  type: 'text' | 'textarea' | 'file' | 'number' | 'select' | 'boolean'
  required?: boolean
  description?: string
  /** type=select 时的可选值 */
  enum?: string[]
  /** type=file 时接受的扩展名，如 '.txt,.md' */
  fileAccept?: string
}

export interface PluginDto {
  /** InstalledPlugin 记录 id */
  id: string
  /** 插件标识（package.json novelagent.id，如 outline-generator） */
  pluginId: string
  displayName: string
  version: string
  author: string | null
  description: string | null
  type: PluginTypeDto
  source: PluginSourceDto
  enabled: boolean
  runtimeStatus: PluginRuntimeStatus
  /** 用户当前配置（已应用 schema 默认值） */
  config: Record<string, unknown>
  configSchema: PluginConfigField[]
  /** 缺失的必需依赖描述，如 ["model-service >=1.0.0"] */
  missingDependencies: string[]
}

export interface UpdatePluginConfigRequest {
  config: Record<string, unknown>
}
