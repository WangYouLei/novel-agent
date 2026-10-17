import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { installPluginFromDirectory } from './installer'
import { scanLocalRepo } from './local-repo'

/**
 * 安装原子化测试（批次 4.1）：
 * 暂存目录复制 → 校验 → 原子 rename 切换；失败不留半成品与 .staging-* 残留
 */

let workDir: string
let pluginsDir: string

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelagent-atomic-test-'))
  pluginsDir = path.join(workDir, 'plugins')
  fs.mkdirSync(pluginsDir, { recursive: true })
})

afterEach(() => {
  fs.rmSync(workDir, { recursive: true, force: true })
})

/** 构造一个插件源目录（package.json + dist/index.js） */
function makePluginDir(dir: string, novelagent: Record<string, unknown> = {}, pkg: Record<string, unknown> = {}): string {
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name: 'demo-plugin',
      version: '1.0.0',
      main: 'dist/index.js',
      novelagent: { id: 'demo-plugin', type: 'feature', ...novelagent },
      ...pkg,
    }),
  )
  fs.writeFileSync(path.join(dir, 'dist', 'index.js'), 'module.exports = {}')
  return dir
}

/** pluginsDir 下的 .staging-* 暂存目录名（应始终为空） */
function stagingEntries(): string[] {
  return fs.readdirSync(pluginsDir).filter((n) => n.startsWith('.staging-'))
}

describe('installPluginFromDirectory 原子化', () => {
  it('正常安装成功：目标目录完整、无 .staging-* 残留、installPath 指向目标目录', () => {
    const srcDir = makePluginDir(path.join(workDir, 'src'))
    const manifest = installPluginFromDirectory(srcDir, pluginsDir, 'LOCAL', () => {})

    expect(manifest.pluginId).toBe('demo-plugin')
    const targetDir = path.join(pluginsDir, 'demo-plugin')
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(targetDir, 'dist', 'index.js'))).toBe(true)
    expect(fs.existsSync(path.join(targetDir, '.meta', 'installedAt'))).toBe(true)
    expect(fs.readFileSync(path.join(targetDir, '.meta', 'source'), 'utf-8')).toBe('local')
    expect(manifest.installPath).toBe(targetDir)
    expect(stagingEntries()).toEqual([])
  })

  it('源 package.json 非法 / 缺 dist：安装抛错且不产生任何残留', () => {
    // 1) package.json 非法 JSON
    const badJson = path.join(workDir, 'src-bad-json')
    fs.mkdirSync(badJson, { recursive: true })
    fs.writeFileSync(path.join(badJson, 'package.json'), '{ not valid json')
    expect(() => installPluginFromDirectory(badJson, pluginsDir, 'LOCAL', () => {})).toThrow()
    expect(fs.existsSync(path.join(pluginsDir, 'demo-plugin'))).toBe(false)
    expect(stagingEntries()).toEqual([])

    // 2) 合法清单但缺 dist/（入口不存在）
    const noDist = path.join(workDir, 'src-no-dist')
    fs.mkdirSync(noDist, { recursive: true })
    fs.writeFileSync(
      path.join(noDist, 'package.json'),
      JSON.stringify({ name: 'demo-plugin', version: '1.0.0', main: 'dist/index.js', novelagent: { id: 'demo-plugin', type: 'feature' } }),
    )
    expect(() => installPluginFromDirectory(noDist, pluginsDir, 'LOCAL', () => {})).toThrow(/插件入口不存在/)
    expect(fs.existsSync(path.join(pluginsDir, 'demo-plugin'))).toBe(false)
    expect(stagingEntries()).toEqual([])
  })

  it('暂存校验失败（入口在 dist 外，复制后清单不可用）：抛错且旧插件保持原样', () => {
    // 先正常安装 v1
    installPluginFromDirectory(makePluginDir(path.join(workDir, 'src-v1')), pluginsDir, 'LOCAL', () => {})
    const targetDir = path.join(pluginsDir, 'demo-plugin')
    fs.writeFileSync(path.join(targetDir, 'dist', 'index.js'), 'module.exports = "original-v1"')

    // 源目录 main 指向根目录 index.js：源清单校验通过，但安装只复制 package.json + dist，
    // 暂存目录中入口不存在 → 校验失败，应在切换目标目录之前中止
    const src = path.join(workDir, 'src-bad-main')
    fs.mkdirSync(path.join(src, 'dist'), { recursive: true })
    fs.writeFileSync(
      path.join(src, 'package.json'),
      JSON.stringify({ name: 'demo-plugin', version: '2.0.0', main: 'index.js', novelagent: { id: 'demo-plugin', type: 'feature' } }),
    )
    fs.writeFileSync(path.join(src, 'index.js'), 'module.exports = {}')
    fs.writeFileSync(path.join(src, 'dist', 'index.js'), 'module.exports = {}')

    expect(() => installPluginFromDirectory(src, pluginsDir, 'LOCAL', () => {})).toThrow(/插件入口不存在/)
    // 旧插件未被破坏（原子化：失败发生在 rmSync 目标目录之前）
    expect(fs.readFileSync(path.join(targetDir, 'dist', 'index.js'), 'utf-8')).toBe('module.exports = "original-v1"')
    expect(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf-8')).toContain('"version":"1.0.0"')
    expect(stagingEntries()).toEqual([])
  })

  it('覆盖安装已有插件成功：旧内容被完整替换（含脏文件清除）', () => {
    installPluginFromDirectory(makePluginDir(path.join(workDir, 'src-v1')), pluginsDir, 'LOCAL', () => {})
    // 模拟旧版本遗留的脏文件（新安装应整目录替换而非增量覆盖）
    const targetDir = path.join(pluginsDir, 'demo-plugin')
    fs.writeFileSync(path.join(targetDir, 'stale-root.txt'), 'old')
    fs.mkdirSync(path.join(targetDir, 'dist', 'stale-dir'), { recursive: true })

    const manifest = installPluginFromDirectory(
      makePluginDir(path.join(workDir, 'src-v2'), {}, { version: '2.0.0' }),
      pluginsDir,
      'MARKETPLACE',
      () => {},
    )
    expect(manifest.version).toBe('2.0.0')
    expect(fs.existsSync(path.join(targetDir, 'stale-root.txt'))).toBe(false)
    expect(fs.existsSync(path.join(targetDir, 'dist', 'stale-dir'))).toBe(false)
    expect(fs.readFileSync(path.join(targetDir, '.meta', 'source'), 'utf-8')).toBe('marketplace')
    expect(stagingEntries()).toEqual([])
  })

  it('连续安装两个不同插件各自成功', () => {
    const m1 = installPluginFromDirectory(makePluginDir(path.join(workDir, 'src-a')), pluginsDir, 'LOCAL', () => {})
    const m2 = installPluginFromDirectory(
      makePluginDir(path.join(workDir, 'src-b'), { id: 'another-plugin' }),
      pluginsDir,
      'MARKETPLACE',
      () => {},
    )
    expect(m1.pluginId).toBe('demo-plugin')
    expect(m2.pluginId).toBe('another-plugin')
    expect(fs.existsSync(path.join(pluginsDir, 'demo-plugin', 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(pluginsDir, 'another-plugin', 'package.json'))).toBe(true)
    expect(stagingEntries()).toEqual([])
  })
})

describe('scanLocalRepo 跳过暂存目录', () => {
  it('. 开头目录（如 .staging-*）不作为插件解析', () => {
    installPluginFromDirectory(makePluginDir(path.join(workDir, 'src')), pluginsDir, 'LOCAL', () => {})
    // 模拟安装中断瞬间残留的暂存目录（内含合法清单）
    makePluginDir(path.join(pluginsDir, '.staging-demo-plugin-1730000000000'))

    const manifests = scanLocalRepo(pluginsDir, () => {})
    expect(manifests).toHaveLength(1)
    expect(manifests[0].pluginId).toBe('demo-plugin')
  })
})
