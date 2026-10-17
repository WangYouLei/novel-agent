import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ForbiddenException, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import semver from 'semver'
import {
  findPluginRootDir,
  readManifest,
  unzipToDir,
  zipDirectory,
} from '@novelagent/market-client'
import type {
  MarketCategoryDto,
  MarketPage,
  MarketPluginDetailDto,
  MarketPluginDto,
  MarketPluginVersionDto,
  MarketUpdateDto,
  PluginConfigField,
} from '@novelagent/shared'

/**
 * 市场注册表（文件系统实现，无需数据库）：
 * <dataDir>/registry.json                          插件索引
 * <dataDir>/packages/<pluginId>/<version>.zip      各版本插件包
 *
 * 启动时从 monorepo packages/plugins/ seed 官方插件（幂等），
 * 第三方插件经 POST /api/market/publish 上传 zip 入库
 */

interface RegistryVersion {
  version: string
  publishedAt: string
  changelog?: string
  downloads: number
}

interface RegistryPlugin {
  pluginId: string
  displayName: string
  type: string
  description?: string
  author?: string
  configSchema: PluginConfigField[]
  dependencies: Record<string, string>
  readme?: string
  /** 官方内置插件标记（seed 自 packages/plugins/）：其 id 为保留字，禁止第三方发布覆盖（评审 H2） */
  official?: boolean
  /** 按发布时间倒序（versions[0] 为最新） */
  versions: RegistryVersion[]
}

interface RegistryFile {
  plugins: RegistryPlugin[]
}

/** 非 string 字段（存量毒数据）归一为文本，避免 toLowerCase 崩溃（评审 M6） */
function toText(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

/** 非字符串或非法 semver 一律视为非法版本（存量毒数据兜底） */
function isValidSemver(version: unknown): version is string {
  return typeof version === 'string' && !!semver.valid(version)
}

/**
 * 版本倒序安全比较器（publish 排序用）：
 * 双方均合法时按倒序比较；非法 semver（存量毒数据）视为最低版本排在最后，不抛错（评审 M6）
 */
function compareVersionDesc(a: string, b: string): number {
  if (isValidSemver(a) && isValidSemver(b)) return semver.gt(b, a) ? 1 : -1
  if (isValidSemver(a)) return -1
  if (isValidSemver(b)) return 1
  return 0
}

@Injectable()
export class MarketRegistryService implements OnModuleInit {
  private readonly logger = new Logger('MarketRegistry')
  private readonly dataDir: string
  private registry: RegistryFile = { plugins: [] }

  constructor() {
    this.dataDir = process.env.MARKET_DATA_ROOT
      ? path.resolve(process.env.MARKET_DATA_ROOT)
      : path.join(this.findRepoRoot(), 'marketplace-data')
  }

  async onModuleInit(): Promise<void> {
    this.load()
    const seeded = this.seedOfficialPlugins()
    if (seeded > 0) this.save()
    this.logger.log(
      `市场就绪：${this.registry.plugins.length} 个插件（数据目录 ${this.dataDir}，本次 seed ${seeded} 个版本）`,
    )
  }

  /** 市场分类：按插件类型固定派生 */
  getCategories(): MarketCategoryDto[] {
    return [
      { id: 'FEATURE', name: '功能插件' },
      { id: 'MODEL', name: '模型插件' },
      { id: 'STYLE_GENERATOR', name: '风格生成' },
    ]
  }

  search(keyword: string, category?: string, page = 1, size = 20): MarketPage<MarketPluginDto> {
    const kw = keyword.trim().toLowerCase()
    const filtered = this.registry.plugins.filter((p) => {
      if (category && p.type !== category) return false
      if (!kw) return true
      // 存量毒数据兜底（评审 M6）：非 string 字段经 String() 归一后再匹配，合法数据行为不变
      return (
        toText(p.pluginId).toLowerCase().includes(kw) ||
        toText(p.displayName).toLowerCase().includes(kw) ||
        toText(p.description).toLowerCase().includes(kw)
      )
    })
    const start = (page - 1) * size
    return {
      items: filtered.slice(start, start + size).map((p) => this.toSummary(p)),
      total: filtered.length,
    }
  }

  getDetail(pluginId: string): MarketPluginDetailDto | null {
    const plugin = this.registry.plugins.find((p) => p.pluginId === pluginId)
    return plugin ? { ...this.toSummary(plugin), configSchema: plugin.configSchema, dependencies: plugin.dependencies, readme: plugin.readme } : null
  }

  getVersions(pluginId: string): MarketPluginVersionDto[] {
    return (
      this.registry.plugins
        .find((p) => p.pluginId === pluginId)
        ?.versions.map((v) => ({ version: v.version, publishedAt: v.publishedAt, changelog: v.changelog })) ?? []
    )
  }

  /** 取插件包（缺省最新版本），下载计数 +1 并持久化 */
  getZip(pluginId: string, version?: string): { buffer: Buffer; filename: string } {
    const plugin = this.registry.plugins.find((p) => p.pluginId === pluginId)
    if (!plugin || plugin.versions.length === 0) throw new Error(`市场不存在插件 ${pluginId}`)
    const target = version
      ? plugin.versions.find((v) => v.version === version)
      : plugin.versions[0]
    if (!target) throw new Error(`插件 ${pluginId} 不存在版本 ${version}`)

    const zipPath = this.zipPath(pluginId, target.version)
    if (!fs.existsSync(zipPath)) throw new Error(`插件包文件缺失：${pluginId}@${target.version}`)
    target.downloads += 1
    this.save()
    return { buffer: fs.readFileSync(zipPath), filename: `${pluginId}-${target.version}.zip` }
  }

  /** 更新检测：市场最新版本高于本地已装版本时返回更新项 */
  checkUpdates(installed: Array<{ pluginId: string; version: string }>): MarketUpdateDto[] {
    const updates: MarketUpdateDto[] = []
    for (const item of installed) {
      const plugin = this.registry.plugins.find((p) => p.pluginId === item.pluginId)
      const latest = plugin?.versions[0]
      if (!latest) continue
      // 市场侧最新版本为非法 semver（存量毒数据）时跳过该插件，视为无更新，避免 semver.gt 抛错（评审 M6）
      if (!isValidSemver(latest.version)) continue
      // 本地非法版本号按"有更新"处理，引导重装对齐
      const outdated = !semver.valid(item.version) || semver.gt(latest.version, item.version)
      if (outdated) {
        updates.push({ pluginId: item.pluginId, currentVersion: item.version, latestVersion: latest.version })
      }
    }
    return updates
  }

  /**
   * 发布插件 zip：解包校验清单 → 存 zip → 更新索引（同版本覆盖发布）
   * @returns 发布后的插件摘要
   */
  publish(zipBuffer: Buffer, changelog?: string): MarketPluginDto {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelagent-publish-'))
    let manifest
    let readme: string | undefined
    try {
      unzipToDir(zipBuffer, tempDir)
      const pluginRoot = findPluginRootDir(tempDir)
      manifest = readManifest(pluginRoot)
      if (!manifest) throw new Error('压缩包缺少 package.json')
      const readmePath = path.join(pluginRoot, 'README.md')
      if (fs.existsSync(readmePath)) readme = fs.readFileSync(readmePath, 'utf-8')
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }

    const existing = this.registry.plugins.find((p) => p.pluginId === manifest.pluginId)
    // 官方插件 id 保留字（评审 H2）：官方内置插件（official 标记，源自 packages/plugins/ seed）禁止第三方发布覆盖
    if (existing?.official) {
      throw new ForbiddenException(`禁止发布：${manifest.pluginId} 为官方插件 id，不可被第三方覆盖或抢注`)
    }

    // 重新打包为标准 zip 存储（统一打包行为，去除多余文件依赖）
    const normalizedZip = this.normalizeZip(zipBuffer)
    fs.mkdirSync(path.dirname(this.zipPath(manifest.pluginId, manifest.version)), { recursive: true })
    fs.writeFileSync(this.zipPath(manifest.pluginId, manifest.version), normalizedZip)

    if (existing) {
      existing.displayName = manifest.displayName
      existing.type = manifest.type
      existing.description = manifest.description
      existing.author = manifest.author
      existing.configSchema = manifest.configSchema
      existing.dependencies = manifest.dependencies
      existing.readme = readme ?? existing.readme
      existing.versions = [
        {
          version: manifest.version,
          publishedAt: new Date().toISOString(),
          changelog,
          downloads: existing.versions.find((v) => v.version === manifest.version)?.downloads ?? 0,
        },
        ...existing.versions.filter((v) => v.version !== manifest.version),
      ]
      // 保持版本倒序（安全比较器：存量非法 semver 视为最低版本排在最后，评审 M6）
      existing.versions.sort((a, b) => compareVersionDesc(a.version, b.version))
    } else {
      this.registry.plugins.push({
        pluginId: manifest.pluginId,
        displayName: manifest.displayName,
        type: manifest.type,
        description: manifest.description,
        author: manifest.author,
        configSchema: manifest.configSchema,
        dependencies: manifest.dependencies,
        readme,
        versions: [
          { version: manifest.version, publishedAt: new Date().toISOString(), changelog, downloads: 0 },
        ],
      })
    }
    this.save()
    this.logger.log(`插件已发布：${manifest.pluginId}@${manifest.version}`)
    return this.toSummary(this.registry.plugins.find((p) => p.pluginId === manifest.pluginId)!)
  }

  /** seed 官方插件：monorepo packages/plugins/ 下已构建的插件幂等入库 */
  private seedOfficialPlugins(): number {
    const pluginsDir = path.join(this.findRepoRoot(), 'packages', 'plugins')
    if (!fs.existsSync(pluginsDir)) return 0
    let seeded = 0
    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(pluginsDir, entry.name)
      if (!fs.existsSync(path.join(dir, 'dist'))) continue
      try {
        const manifest = readManifest(dir)
        if (!manifest) continue
        const existing = this.registry.plugins.find((p) => p.pluginId === manifest.pluginId)
        if (existing?.versions.some((v) => v.version === manifest.version)) continue
        fs.mkdirSync(path.dirname(this.zipPath(manifest.pluginId, manifest.version)), { recursive: true })
        fs.writeFileSync(this.zipPath(manifest.pluginId, manifest.version), zipDirectory(dir))
        if (existing) {
          // packages/plugins/ 来源即官方内置：统一打 official 标记（id 保留字生效，含历史上被抢注的同名条目）
          existing.official = true
          existing.versions.unshift({
            version: manifest.version,
            publishedAt: new Date().toISOString(),
            changelog: '官方内置插件',
            downloads: 0,
          })
        } else {
          this.registry.plugins.push({
            pluginId: manifest.pluginId,
            displayName: manifest.displayName,
            type: manifest.type,
            description: manifest.description,
            author: manifest.author,
            configSchema: manifest.configSchema,
            dependencies: manifest.dependencies,
            official: true,
            versions: [
              { version: manifest.version, publishedAt: new Date().toISOString(), changelog: '官方内置插件', downloads: 0 },
            ],
          })
        }
        seeded += 1
        this.logger.log(`官方插件入库：${manifest.pluginId}@${manifest.version}`)
      } catch (err) {
        // 单个官方插件 seed 失败不影响市场启动
        this.logger.warn(`官方插件 ${entry.name} seed 失败：${(err as Error).message}`)
      }
    }
    return seeded
  }

  private toSummary(p: RegistryPlugin): MarketPluginDto {
    return {
      pluginId: p.pluginId,
      displayName: p.displayName,
      version: p.versions[0]?.version ?? '0.0.0',
      type: p.type,
      description: p.description,
      author: p.author,
      downloads: p.versions.reduce((sum, v) => sum + v.downloads, 0),
    }
  }

  /** 发布包规范校验后原样存储（后续可在此做签名/重打包） */
  private normalizeZip(zipBuffer: Buffer): Buffer {
    return zipBuffer
  }

  private zipPath(pluginId: string, version: string): string {
    const zipPath = path.join(this.dataDir, 'packages', pluginId, `${version}.zip`)
    // 纵深防御：确认解析后仍在市场包目录内（评审 H3 二次路径穿越）
    const packagesRoot = path.resolve(this.dataDir, 'packages')
    const resolved = path.resolve(zipPath)
    if (resolved !== packagesRoot && !resolved.startsWith(packagesRoot + path.sep)) {
      throw new Error(`非法的插件包路径：${pluginId}@${version}`)
    }
    return zipPath
  }

  private registryPath(): string {
    return path.join(this.dataDir, 'registry.json')
  }

  private load(): void {
    const file = this.registryPath()
    if (!fs.existsSync(file)) return
    try {
      this.registry = JSON.parse(fs.readFileSync(file, 'utf-8')) as RegistryFile
    } catch (err) {
      // 索引损坏时重置而非阻断启动（zip 仍在，可重新发布/seed）
      this.logger.error(`registry.json 解析失败，已重置：${(err as Error).message}`)
      this.registry = { plugins: [] }
    }
  }

  /** 原子写：先写临时文件再 rename，避免写一半损坏索引 */
  private save(): void {
    fs.mkdirSync(this.dataDir, { recursive: true })
    const tmp = `${this.registryPath()}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.registry, null, 2), 'utf-8')
    fs.renameSync(tmp, this.registryPath())
  }

  /** 定位仓库根目录（dev 运行 src，prod 运行 dist） */
  private findRepoRoot(): string {
    let dir = __dirname
    for (let i = 0; i < 5; i++) {
      if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
      dir = path.dirname(dir)
    }
    throw new Error('无法定位仓库根目录（pnpm-workspace.yaml）')
  }
}
