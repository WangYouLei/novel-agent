import type { Context } from 'cordis'
import type { GenerationProgressPayload, PluginStatusChangedEvent } from '@novelagent/shared'

/**
 * 前端事件声明合并（前端独立打包的 cordis 实例，类型与后端各自维护）
 * 后端转发的事件统一在此登记，页面 ctx.on 使用时获得类型提示
 */
declare module 'cordis' {
  interface Events<C extends Context = Context> {
    'generation-progress'(payload: GenerationProgressPayload): void
    'plugin-status-changed'(data: PluginStatusChangedEvent): void
    'outline-generated'(data: { novelId: string; pluginId: string }): void
  }
}
