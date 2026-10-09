/**
 * 远程市场客户端（文档 6.7：MVP 为 Mock 实现，全部返回空，后续替换为 HttpMarketplaceClient）
 */
export interface PluginSummary {
  pluginId: string
  displayName: string
  version: string
  type: string
  description?: string
  author?: string
  downloads: number
}

export interface PluginDetail extends PluginSummary {
  configSchema: unknown[]
  dependencies: Record<string, string>
  readme?: string
}

export interface PluginVersion {
  version: string
  publishedAt: string
  changelog?: string
}

export interface PluginUpdate {
  pluginId: string
  currentVersion: string
  latestVersion: string
}

export interface PluginCategory {
  id: string
  name: string
}

export interface Page<T> {
  items: T[]
  total: number
}

export interface MarketplaceClient {
  searchPlugins(keyword: string, category?: string, page?: number, size?: number): Promise<Page<PluginSummary>>
  getPluginDetail(pluginId: string): Promise<PluginDetail | null>
  getPluginVersions(pluginId: string): Promise<PluginVersion[]>
  downloadPlugin(pluginId: string, version: string): Promise<string>
  checkUpdates(installed: Array<{ pluginId: string; version: string }>): Promise<PluginUpdate[]>
  getCategories(): Promise<PluginCategory[]>
  isAvailable(): boolean
}

/** Mock 实现：市场服务端未部署前一律返回空结果 */
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
  isAvailable(): boolean {
    return false
  }
}
