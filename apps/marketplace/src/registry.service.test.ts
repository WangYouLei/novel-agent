import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { ForbiddenException } from '@nestjs/common'
import { MarketRegistryService } from './registry.service'

/**
 * 市场注册表安全与容错测试（批次 2，评审 H2/M6）：
 * 官方插件 id 保留字（official 标记）、存量毒数据（非法 semver / 非 string 字段）读取兜底
 */

let dataDir: string
let originalDataRoot: string | undefined

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelagent-market-test-'))
  originalDataRoot = process.env.MARKET_DATA_ROOT
  process.env.MARKET_DATA_ROOT = dataDir
})

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.MARKET_DATA_ROOT
  else process.env.MARKET_DATA_ROOT = originalDataRoot
  fs.rmSync(dataDir, { recursive: true, force: true })
})

/** 构造合法插件 zip（package.json + dist/index.js，可通过 readManifest 白名单校验） */
function makePluginZip(pluginId: string, version: string, displayName = '测试插件'): Buffer {
  const zip = new AdmZip()
  zip.addFile(
    'package.json',
    Buffer.from(
      JSON.stringify({
        name: pluginId,
        version,
        main: 'dist/index.js',
        novelagent: { id: pluginId, type: 'feature', displayName, description: '测试用插件' },
      }),
    ),
  )
  zip.addFile('dist/index.js', Buffer.from('module.exports = {}'))
  return zip.toBuffer()
}

/** 向服务私有 registry 字段注入内存态（跳过文件 seed，直接构造 registry.json 等价数据） */
function injectRegistry(service: MarketRegistryService, plugins: unknown[]): void {
  ;(service as unknown as { registry: { plugins: unknown[] } }).registry = { plugins }
}

/** 构造一条注册表插件条目（默认合法，可覆盖为毒数据/官方标记） */
function makeEntry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    pluginId: 'demo',
    displayName: '演示插件',
    type: 'FEATURE',
    configSchema: [],
    dependencies: {},
    versions: [{ version: '1.0.0', publishedAt: new Date().toISOString(), downloads: 0 }],
    ...overrides,
  }
}

describe('官方插件 id 保留字（评审 H2）', () => {
  it('publish 覆盖 official 插件 → ForbiddenException（403），信息含"官方插件 id"', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [makeEntry({ pluginId: 'outline-generator', official: true })])

    try {
      service.publish(makePluginZip('outline-generator', '9.9.9'))
      expect.unreachable('覆盖官方插件 id 应抛 ForbiddenException')
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException)
      expect((err as Error).message).toContain('官方插件 id')
    }
    // 拒绝发生在写盘之前：官方插件包目录未被创建
    expect(fs.existsSync(path.join(dataDir, 'packages', 'outline-generator'))).toBe(false)
  })

  it('非官方 id 正常发布成功', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [makeEntry({ pluginId: 'outline-generator', official: true })])

    const dto = service.publish(makePluginZip('third-party-plugin', '1.0.0'))
    expect(dto.pluginId).toBe('third-party-plugin')
    expect(dto.version).toBe('1.0.0')
  })

  it('官方 id 抢注（registry 中尚不存在）不受影响：保留字只认 official 标记', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [makeEntry({ pluginId: 'other-plugin', official: true })])

    // 与官方插件同名但 registry 中不存在的 id 不受保留字限制（保留字来源是 seed 清单而非硬编码）
    const dto = service.publish(makePluginZip('outline-generator', '1.0.0'))
    expect(dto.pluginId).toBe('outline-generator')
  })

  it('official 标记随 registry.json 持久化（save/load 往返后保留字仍生效）', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [makeEntry({ pluginId: 'outline-generator', official: true })])
    // 发布非官方插件触发 save()，把含 official 标记的 registry 写盘
    service.publish(makePluginZip('third-party-plugin', '1.0.0'))

    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, 'registry.json'), 'utf-8'))
    expect(raw.plugins.find((p: { pluginId: string }) => p.pluginId === 'outline-generator').official).toBe(true)

    // 新实例 load() 读回后保留字仍生效
    const service2 = new MarketRegistryService()
    ;(service2 as unknown as { load(): void }).load()
    expect(() => service2.publish(makePluginZip('outline-generator', '9.9.9'))).toThrow(ForbiddenException)
  })
})

describe('读取接口降级容错（评审 M6）', () => {
  it('checkUpdates：latest 为非法 semver 时跳过该插件（视为无更新），合法插件行为不变', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [
      makeEntry({ pluginId: 'poison', versions: [{ version: 'not-semver', publishedAt: '2026-01-01', downloads: 0 }] }),
      makeEntry({ pluginId: 'normal', versions: [{ version: '2.0.0', publishedAt: '2026-01-01', downloads: 0 }] }),
    ])

    const updates = service.checkUpdates([
      { pluginId: 'poison', version: '1.0.0' },
      { pluginId: 'normal', version: '1.0.0' },
    ])
    expect(updates).toHaveLength(1)
    expect(updates[0].pluginId).toBe('normal')
    expect(updates[0].latestVersion).toBe('2.0.0')
  })

  it('checkUpdates：本地已装版本非法 semver 仍按"有更新"处理（行为兼容）', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [makeEntry({ pluginId: 'normal' })])

    const updates = service.checkUpdates([{ pluginId: 'normal', version: 'bad-version' }])
    expect(updates).toHaveLength(1)
    expect(updates[0].latestVersion).toBe('1.0.0')
  })

  it('二次 publish：registry 存量非法 semver 版本不致 500，非法版本排在最后', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [
      makeEntry({
        pluginId: 'demo',
        versions: [
          { version: 'not-semver', publishedAt: '2026-01-01', downloads: 0 },
          { version: '1.0.0', publishedAt: '2026-01-01', downloads: 0 },
        ],
      }),
    ])

    const dto = service.publish(makePluginZip('demo', '3.0.0'))
    expect(dto.version).toBe('3.0.0')
    expect(service.getVersions('demo').map((v) => v.version)).toEqual(['3.0.0', '1.0.0', 'not-semver'])
  })

  it('search：非 string 字段（存量毒数据）不致 500，合法关键词行为不变', () => {
    const service = new MarketRegistryService()
    injectRegistry(service, [
      makeEntry({ pluginId: 123, displayName: 456, description: 789 }),
      makeEntry({ pluginId: 'demo', displayName: '演示插件', description: '官方描述' }),
    ])

    // 合法数据关键词匹配行为不变
    const page = service.search('演示')
    expect(page.total).toBe(1)
    expect(page.items[0].pluginId).toBe('demo')

    // 数字毒数据经 String() 归一后可被命中，不抛错
    expect(service.search('123').total).toBe(1)
    expect(service.search('789').total).toBe(1)

    // 空关键词全量返回（含毒数据条目），不抛错
    expect(service.search('').total).toBe(2)
  })
})
