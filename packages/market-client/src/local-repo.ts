import fs from 'node:fs'
import path from 'node:path'
import type { PluginManifest, PluginConfigField, PluginInputField } from './manifest'

/**
 * 本地插件仓库（文档 6.1/6.2）：
 * 扫描 DATA_ROOT/plugins/ 下每个插件目录的 package.json，
 * 解析 novelagent 字段产出插件清单
 */

/** 扫描插件目录，返回可识别的插件清单（损坏的目录记录日志并跳过，不阻断启动） */
export function scanLocalRepo(pluginsDir: string, log: (msg: string) => void = console.log): PluginManifest[] {
  if (!fs.existsSync(pluginsDir)) {
    log(`[market-client] 插件目录不存在：${pluginsDir}`)
    return []
  }

  const manifests: PluginManifest[] = []
  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const dir = path.join(pluginsDir, entry.name)
    try {
      const manifest = readManifest(dir)
      if (manifest) manifests.push(manifest)
    } catch (err) {
      log(`[market-client] 插件 ${entry.name} 清单解析失败，已跳过：${(err as Error).message}`)
    }
  }
  return manifests
}

/** 读取并校验单个插件目录的清单 */
export function readManifest(pluginDir: string): PluginManifest | undefined {
  const pkgPath = path.join(pluginDir, 'package.json')
  if (!fs.existsSync(pkgPath)) return undefined

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
    name?: string
    version?: string
    main?: string
    novelagent?: Record<string, unknown>
  }
  const meta = pkg.novelagent
  if (!meta || typeof meta.id !== 'string') {
    throw new Error('package.json 缺少 novelagent.id 字段')
  }

  // 插件类型归一化为大写下划线（文档 4.2 示例用小写，允许 style-generator 连字符写法）
  const rawType = String(meta.type ?? '').toUpperCase().replace(/-/g, '_')
  const type = rawType as PluginManifest['type']
  if (!['FEATURE', 'MODEL', 'STYLE_GENERATOR'].includes(rawType)) {
    throw new Error(`非法插件类型：${meta.type}`)
  }

  const entryFile = pkg.main ?? 'dist/index.js'
  if (!fs.existsSync(path.join(pluginDir, entryFile))) {
    throw new Error(`插件入口不存在：${entryFile}`)
  }

  return {
    pluginId: meta.id,
    displayName: (meta.displayName as string) ?? meta.id,
    version: pkg.version ?? '0.0.0',
    type,
    description: meta.description as string | undefined,
    author: meta.author as string | undefined,
    dependencies: (meta.dependencies as Record<string, string>) ?? {},
    optionalDependencies: (meta.optionalDependencies as Record<string, string>) ?? {},
    configSchema: (meta.configSchema as PluginConfigField[]) ?? [],
    inputSchema: (meta.inputSchema as PluginInputField[]) ?? [],
    installPath: pluginDir,
    entryFile,
  }
}
