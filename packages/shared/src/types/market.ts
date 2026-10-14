import type { PluginConfigField } from './plugin'

/**
 * 插件市场 DTO（前后端共享，PRD 5.x 插件市场 + 文档 6.7 MarketplaceClient 契约）
 * 类型单源定义于此：market-client 的 MarketplaceClient 与 web 市场 API 均复用
 */

/** 市场插件摘要（浏览/搜索列表项） */
export interface MarketPluginDto {
  pluginId: string
  displayName: string
  /** 最新版本号 */
  version: string
  type: string
  description?: string
  author?: string
  downloads: number
}

/** 市场插件详情 */
export interface MarketPluginDetailDto extends MarketPluginDto {
  configSchema: PluginConfigField[]
  dependencies: Record<string, string>
  readme?: string
}

/** 市场插件历史版本 */
export interface MarketPluginVersionDto {
  version: string
  publishedAt: string
  changelog?: string
}

/** 可更新项（市场版本高于本地已装版本） */
export interface MarketUpdateDto {
  pluginId: string
  currentVersion: string
  latestVersion: string
}

/** 市场分类（按插件类型派生） */
export interface MarketCategoryDto {
  id: string
  name: string
}

/** 市场分页结果 */
export interface MarketPage<T> {
  items: T[]
  total: number
}

/** 市场服务连通状态 */
export interface MarketStatusDto {
  available: boolean
  baseUrl: string
}

/** 从市场安装/更新插件请求 */
export interface InstallFromMarketRequest {
  pluginId: string
  /** 不传则安装最新版本 */
  version?: string
}

/** 安装/更新结果（web 安装接口统一返回） */
export interface PluginInstallResultDto {
  pluginId: string
  displayName: string
  version: string
  /** 安装热重载后的运行状态（STARTED / ERROR / DEPENDENCY_MISSING） */
  runtimeStatus: string
}
