import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  MarketplaceClient,
  Page,
  PluginCategory,
  PluginDetail,
  PluginSummary,
  PluginUpdate,
  PluginVersion,
} from './remote-api'
import { unzipToDir } from './zip'

/**
 * HTTP 远程市场客户端（文档 6.7：替换 Mock 的正式实现）
 * - baseUrl 指向独立市场服务（apps/marketplace），可用 MARKETPLACE_URL 覆盖
 * - downloadPlugin 下载 zip 并解压到系统临时目录，返回插件根目录（调用方安装后负责清理）
 */

export interface HttpMarketplaceOptions {
  baseUrl: string
  /** 普通请求超时（毫秒），默认 5000 */
  timeoutMs?: number
  /** 探活超时（毫秒），默认 2000 */
  healthTimeoutMs?: number
}

export class HttpMarketplaceClient implements MarketplaceClient {
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly healthTimeoutMs: number

  constructor(options: HttpMarketplaceOptions) {
    // 去尾斜杠，与 openai-model 插件的 baseUrl 处理一致
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.timeoutMs = options.timeoutMs ?? 5000
    this.healthTimeoutMs = options.healthTimeoutMs ?? 2000
  }

  /** 市场服务地址（状态展示用） */
  getBaseUrl(): string {
    return this.baseUrl
  }

  async searchPlugins(
    keyword: string,
    category?: string,
    page = 1,
    size = 20,
  ): Promise<Page<PluginSummary>> {
    const query = new URLSearchParams({ keyword, page: String(page), size: String(size) })
    if (category) query.set('category', category)
    return this.requestJson(`/api/market/plugins?${query}`)
  }

  async getPluginDetail(pluginId: string): Promise<PluginDetail | null> {
    return this.requestJson(`/api/market/plugins/${encodeURIComponent(pluginId)}`, {
      notFoundAsNull: true,
    })
  }

  async getPluginVersions(pluginId: string): Promise<PluginVersion[]> {
    return this.requestJson(`/api/market/plugins/${encodeURIComponent(pluginId)}/versions`)
  }

  /**
   * 下载指定版本（缺省最新）并解压到临时目录
   * @returns 解压后的插件根目录（含 package.json 与 dist/）
   */
  async downloadPlugin(pluginId: string, version: string): Promise<string> {
    const query = version ? `?version=${encodeURIComponent(version)}` : ''
    const res = await this.fetchWithTimeout(
      `/api/market/plugins/${encodeURIComponent(pluginId)}/download${query}`,
    )
    if (res.status === 404) throw new Error(`市场不存在插件 ${pluginId}@${version || 'latest'}`)
    if (!res.ok) throw new Error(`下载失败：HTTP ${res.status}`)

    const zipBuffer = Buffer.from(await res.arrayBuffer())
    // 临时目录解压：命名带 pluginId 便于排查残留
    const extractDir = fs.mkdtempSync(path.join(os.tmpdir(), `novelagent-plugin-${pluginId}-`))
    unzipToDir(zipBuffer, extractDir)
    return extractDir
  }

  async checkUpdates(installed: Array<{ pluginId: string; version: string }>): Promise<PluginUpdate[]> {
    return this.requestJson(`/api/market/updates`, {
      method: 'POST',
      body: JSON.stringify({ installed }),
    })
  }

  async getCategories(): Promise<PluginCategory[]> {
    return this.requestJson('/api/market/categories')
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetchWithTimeout('/api/market/health', {
        timeoutMs: this.healthTimeoutMs,
      })
      return res.ok
    } catch {
      return false
    }
  }

  /** 统一 fetch：拼接 baseUrl、带超时 */
  private fetchWithTimeout(
    pathname: string,
    init: { method?: string; body?: string; timeoutMs?: number } = {},
  ): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? this.timeoutMs)
    return fetch(`${this.baseUrl}${pathname}`, {
      method: init.method ?? 'GET',
      body: init.body,
      signal: controller.signal,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    }).finally(() => clearTimeout(timer))
  }

  /** JSON 请求：非 2xx 抛错，404 可按需转 null */
  private async requestJson<T>(
    pathname: string,
    init: { method?: string; body?: string; notFoundAsNull?: boolean } = {},
  ): Promise<T> {
    const res = await this.fetchWithTimeout(pathname, init)
    if (res.status === 404 && init.notFoundAsNull) return null as T
    if (!res.ok) {
      const message = await res.text().catch(() => '')
      throw new Error(`市场请求失败（HTTP ${res.status}）：${message.slice(0, 200)}`)
    }
    return (await res.json()) as T
  }
}
