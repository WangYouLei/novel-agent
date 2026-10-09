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
