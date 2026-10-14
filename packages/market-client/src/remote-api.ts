/**
 * 远程市场客户端契约（文档 6.7）
 * DTO 类型单源定义于 @novelagent/shared（前端共用），此处保留原别名以兼容既有引用
 */
import type {
  MarketCategoryDto,
  MarketPage,
  MarketPluginDetailDto,
  MarketPluginDto,
  MarketPluginVersionDto,
  MarketUpdateDto,
} from '@novelagent/shared'

export type PluginSummary = MarketPluginDto
export type PluginDetail = MarketPluginDetailDto
export type PluginVersion = MarketPluginVersionDto
export type PluginUpdate = MarketUpdateDto
export type PluginCategory = MarketCategoryDto
export type Page<T> = MarketPage<T>

export interface MarketplaceClient {
  searchPlugins(keyword: string, category?: string, page?: number, size?: number): Promise<Page<PluginSummary>>
  getPluginDetail(pluginId: string): Promise<PluginDetail | null>
  getPluginVersions(pluginId: string): Promise<PluginVersion[]>
  downloadPlugin(pluginId: string, version: string): Promise<string>
  checkUpdates(installed: Array<{ pluginId: string; version: string }>): Promise<PluginUpdate[]>
  getCategories(): Promise<PluginCategory[]>
  isAvailable(): Promise<boolean>
  /** 市场服务地址（状态展示/错误提示用） */
  getBaseUrl(): string
}

/** Mock 实现：市场服务端未部署前一律返回空结果（downloadPlugin 语义见 HttpMarketplaceClient） */
export class MockMarketplaceClient implements MarketplaceClient {
  async searchPlugins(): Promise<Page<PluginSummary>> {
    return { items: [], total: 0 }
  }
  async getPluginDetail(): Promise<PluginDetail | null> {
    return null
  }
  async getPluginVersions(): Promise<PluginVersion[]> {
    return []
  }
  async downloadPlugin(): Promise<string> {
    throw new Error('插件市场尚未开放（MVP 仅支持本地插件）')
  }
  async checkUpdates(): Promise<PluginUpdate[]> {
    return []
  }
  async getCategories(): Promise<PluginCategory[]> {
    return []
  }
  async isAvailable(): Promise<boolean> {
    return false
  }
  getBaseUrl(): string {
    return ''
  }
}
