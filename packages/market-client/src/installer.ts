import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { BizError, ErrorCode } from '@novelagent/shared'
import { readManifest } from './local-repo'
import { findPluginRootDir, unzipToDir } from './zip'
import { assertValidPluginId } from './manifest'
import type { PluginManifest } from './manifest'

/**
 * 插件安装/同步（文档 6.2 目录布局的维护者）
 * - syncBuiltinPlugins：启动时将 monorepo 内置插件同步到 DATA_ROOT/plugins/
 * - installPluginFromDirectory / installPluginFromZip：市场与本地 zip 的按需安装
 * - uninstallPlugin：卸载非内置插件（删除目录，配合宿主热重载）
 * 并保证插件运行时可解析宿主的共享依赖（@novelagent/core / cordis）
 */

export interface SyncResult {
  synced: string[]
  unchanged: string[]
}

/** 按需安装来源（DB InstalledPlugin.source 对应值） */
export type PluginInstallSource = 'LOCAL' | 'MARKETPLACE'

/** 读取插件安装元数据中的来源标识（.meta/source），目录缺失时返回 undefined */
export function readInstallSource(pluginDir: string): string | undefined {
  try {
    return fs.readFileSync(path.join(pluginDir, '.meta', 'source'), 'utf-8').trim()
  } catch {
    return undefined
  }
}

/** 校验 target 解析后仍位于 root 目录内（评审 H1/H3：防路径穿越的纵深防御） */
function ensureWithin(root: string, target: string): void {
  const resolvedRoot = path.resolve(root)
  const resolvedTarget = path.resolve(target)
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`路径越界：${target} 不在 ${root} 目录内`)
  }
}

/**
 * 从源目录安装插件（市场下载解压后 / 本地目录）：
 * 校验清单 → 暂存目录复制并校验 → 原子切换到目标目录（package.json + dist）→ 写 .meta 元数据
 * @returns 安装后的清单（installPath 指向目标目录）
 */
export function installPluginFromDirectory(
  sourceDir: string,
  pluginsDir: string,
  source: PluginInstallSource,
  log: (msg: string) => void = console.log,
): PluginManifest {
  const manifest = readManifest(sourceDir)
  if (!manifest) throw new Error(`插件源目录缺少 package.json：${sourceDir}`)

  const targetDir = path.join(pluginsDir, manifest.pluginId)
  // 纵深防御：确认目标目录仍在 plugins 根内（评审 H1）
  ensureWithin(pluginsDir, targetDir)
  // 拒绝覆盖内置插件（评审 H1 放大点：对齐卸载端点已有的防护；须在动目标目录之前判定）
  if (readInstallSource(targetDir) === 'builtin') {
    throw new BizError(ErrorCode.PLUGIN_INSTALL_FORBIDDEN, `内置插件 ${manifest.pluginId} 不可覆盖安装（随宿主启动同步维护）`)
  }

  // 安装原子化：先在暂存目录完成复制与校验，通过后一次性切换到目标目录，
  // 避免逐文件复制中途中断留下半成品目录、被宿主扫描为损坏插件
  const stagingDir = path.join(pluginsDir, `.staging-${manifest.pluginId}-${Date.now()}`)
  ensureWithin(pluginsDir, stagingDir)
  try {
    fs.mkdirSync(stagingDir, { recursive: true })
    fs.copyFileSync(path.join(sourceDir, 'package.json'), path.join(stagingDir, 'package.json'))
    fs.cpSync(path.join(sourceDir, 'dist'), path.join(stagingDir, 'dist'), { recursive: true })

    // 安装元数据（文档 6.2 .meta/）
    const metaDir = path.join(stagingDir, '.meta')
    fs.mkdirSync(metaDir, { recursive: true })
    fs.writeFileSync(path.join(metaDir, 'installedAt'), new Date().toISOString())
    fs.writeFileSync(path.join(metaDir, 'source'), source.toLowerCase())

    // 校验暂存目录：清单可读且 pluginId/version 与源一致、dist 存在，确认复制完整后才切换
    const staged = readManifest(stagingDir)
    if (!staged) throw new Error(`暂存目录清单读取失败：${manifest.pluginId}`)
    if (staged.pluginId !== manifest.pluginId || staged.version !== manifest.version) {
      throw new Error(`暂存目录清单与源不一致：${manifest.pluginId}@${manifest.version}`)
    }
    if (!fs.existsSync(path.join(stagingDir, 'dist'))) {
      throw new Error(`暂存目录缺少 dist：${manifest.pluginId}`)
    }

    // 原子切换：Windows 上 rename 到已存在目录会失败，须先删除目标再 rename；
    // 该删除-切换窗口远小于逐文件复制的窗口，可接受
    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.renameSync(stagingDir, targetDir)
  } finally {
    // 成功时暂存目录已 rename 走，失败时清理半成品，均保证无 .staging-* 残留
    fs.rmSync(stagingDir, { recursive: true, force: true })
  }

  log(`[installer] 插件已安装（${source}）：${manifest.pluginId}@${manifest.version}`)
  // 重新读取以返回 installPath 指向目标目录的清单
  const installed = readManifest(targetDir)
  if (!installed) throw new Error(`安装后清单读取失败：${manifest.pluginId}`)
  return installed
}

/**
 * 从 zip 包安装插件（本地 zip 上传场景）：
 * 解压到临时目录 → 定位插件根 → 安装 → 清理临时目录
 */
export function installPluginFromZip(
  zipBuffer: Buffer,
  pluginsDir: string,
  source: PluginInstallSource,
  log: (msg: string) => void = console.log,
): PluginManifest {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelagent-install-'))
  try {
    unzipToDir(zipBuffer, tempDir)
    const pluginRoot = findPluginRootDir(tempDir)
    return installPluginFromDirectory(pluginRoot, pluginsDir, source, log)
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

/**
 * 卸载插件：删除 DATA_ROOT/plugins/<pluginId> 目录（宿主随后热重载）
 * 内置插件（.meta/source=builtin，由启动同步维护）拒绝卸载
 */
export function uninstallPlugin(pluginsDir: string, pluginId: string, log: (msg: string) => void = console.log): void {
  // pluginId 来自 URL 参数，删除前先过白名单与越界校验（评审 H1 卸载路径）
  assertValidPluginId(pluginId)
  const pluginDir = path.join(pluginsDir, pluginId)
  ensureWithin(pluginsDir, pluginDir)
  if (!fs.existsSync(pluginDir)) {
    throw new Error(`插件 ${pluginId} 不存在，无法卸载`)
  }
  if (readInstallSource(pluginDir) === 'builtin') {
    throw new Error('内置插件不可卸载（随宿主启动同步维护）')
  }
  fs.rmSync(pluginDir, { recursive: true, force: true })
  log(`[installer] 插件已卸载：${pluginId}`)
}

/**
 * 同步内置插件：源目录（packages/plugins/<name>，含 dist 与 package.json）→ pluginsDir
 * 幂等：目标版本一致时跳过复制
 */
export function syncBuiltinPlugins(
  builtinPluginDirs: string[],
  pluginsDir: string,
  log: (msg: string) => void = console.log,
): SyncResult {
  const result: SyncResult = { synced: [], unchanged: [] }
  fs.mkdirSync(pluginsDir, { recursive: true })

  for (const sourceDir of builtinPluginDirs) {
    let manifest: PluginManifest | undefined
    try {
      manifest = readManifest(sourceDir)
    } catch (err) {
      log(`[installer] 跳过无效的内置插件源 ${sourceDir}：${(err as Error).message}`)
      continue
    }
    if (!manifest) continue

    const targetDir = path.join(pluginsDir, manifest.pluginId)
    ensureWithin(pluginsDir, targetDir)
    const targetPkg = path.join(targetDir, 'package.json')

    // 版本一致则不同步（dist 内容假定与版本对应）
    if (fs.existsSync(targetPkg)) {
      try {
        const existing = readManifest(targetDir)
        if (existing && existing.version === manifest.version) {
          result.unchanged.push(manifest.pluginId)
          continue
        }
      } catch {
        // 目标损坏，走重新同步
      }
    }

    // 复制 package.json 与 dist/
    fs.rmSync(targetDir, { recursive: true, force: true })
    fs.mkdirSync(targetDir, { recursive: true })
    fs.copyFileSync(path.join(sourceDir, 'package.json'), targetPkg)
    fs.cpSync(path.join(sourceDir, 'dist'), path.join(targetDir, 'dist'), { recursive: true })

    // 写入安装元数据（文档 6.2 .meta/）
    const metaDir = path.join(targetDir, '.meta')
    fs.mkdirSync(metaDir, { recursive: true })
    fs.writeFileSync(path.join(metaDir, 'installedAt'), new Date().toISOString())
    fs.writeFileSync(path.join(metaDir, 'source'), 'builtin')

    result.synced.push(manifest.pluginId)
    log(`[installer] 内置插件已同步：${manifest.pluginId}@${manifest.version}`)
  }
  return result
}

/**
 * 保证插件目录能解析共享依赖：
 * 在 dataRoot/node_modules 下建立指向宿主包根目录的链接（Windows 用 junction，无需管理员权限）
 * 插件 dist 中 external 的 @novelagent/core / cordis 由此解析，与宿主共享同一运行时实例
 *
 * @param hostModules 依赖名 → 宿主中的包根目录（经 resolvePackageDir 解析）
 */
export function ensureSharedDependencies(
  dataRoot: string,
  hostModules: Record<string, string>,
  log: (msg: string) => void = console.log,
): void {
  const nmDir = path.join(dataRoot, 'node_modules')
  fs.mkdirSync(nmDir, { recursive: true })

  for (const [name, source] of Object.entries(hostModules)) {
    // @novelagent/core 是 scope 包：需要 @novelagent 目录
    const linkPath = path.join(nmDir, ...name.split('/'))
    const scopeDir = path.dirname(linkPath)
    fs.mkdirSync(scopeDir, { recursive: true })

    if (fs.existsSync(linkPath)) continue
    try {
      fs.symlinkSync(source, linkPath, 'junction')
      log(`[installer] 已链接共享依赖：${name} -> ${source}`)
    } catch (err) {
      // 链接失败（如权限受限）时退化为复制
      log(`[installer] 链接失败，退化为复制：${name}（${(err as Error).message}）`)
      fs.cpSync(source, linkPath, { recursive: true })
    }
  }
}

/**
 * 解析包根目录：require.resolve 返回的是入口文件（如 cordis/lib/index.cjs），
 * 需向上查找到包含 package.json 且 name 匹配的目录
 */
export function resolvePackageDir(name: string, from: string = process.cwd()): string {
  const require = createRequire(path.resolve(from, 'noop.js'))
  const entry = require.resolve(name)
  let dir = path.dirname(entry)
  const shortName = name.split('/').pop() ?? name
  for (let i = 0; i < 8; i++) {
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { name?: string }
      if (pkg.name === name || pkg.name === shortName || path.basename(dir) === shortName) {
        return dir
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`无法定位包 ${name} 的根目录（入口：${entry}）`)
}
