import type { PluginConfigField, PluginInputField } from '@novelagent/shared'

export type { PluginConfigField, PluginInputField }

/**
 * 插件清单：从插件 package.json 的 novelagent 字段解析（文档 4.2）
 */
export interface PluginManifest {
  /** 插件标识（服务名/依赖声明 key） */
  pluginId: string
  displayName: string
  version: string
  type: 'FEATURE' | 'MODEL' | 'STYLE_GENERATOR'
  description?: string
  author?: string
  dependencies: Record<string, string>
  optionalDependencies: Record<string, string>
  configSchema: PluginConfigField[]
  /** 运行时输入声明（Chat 调度器据此组装/校验插件输入） */
  inputSchema: PluginInputField[]
  /** 插件目录绝对路径（含 dist/ 与 package.json） */
  installPath: string
  /** 入口文件相对路径（默认 dist/index.js） */
  entryFile: string
}

/** 内核提供的系统服务（作为依赖目标时视为可用，版本恒满足） */
export const KERNEL_SERVICES = ['model-service', 'style-pack-service', 'plugin-registry'] as const

/** 插件 id 白名单：小写字母/数字/连字符（评审 H1/H3：防路径穿越与官方 id 抢注） */
export const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/** 校验插件 id 格式（同时用于安装来源清单与卸载参数），非法时抛错 */
export function assertValidPluginId(pluginId: string): void {
  if (typeof pluginId !== 'string' || !PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`非法插件 id：${JSON.stringify(pluginId)}（仅允许小写字母/数字/连字符）`)
  }
}
