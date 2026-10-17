import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { BizError, ErrorCode } from '@novelagent/shared'
import { readManifest } from './local-repo'
import { installPluginFromDirectory, installPluginFromZip, uninstallPlugin } from './installer'
import { unzipToDir, MAX_ZIP_ENTRIES, MAX_ZIP_TOTAL_BYTES } from './zip'

/**
 * 插件供应链安全测试（批次 1，评审 H1/H3/H4/M6）：
 * 恶意 pluginId（穿越 / 抢注）、zip 炸弹（条目数 / 总大小）、正常安装四类 fixture
 */

let workDir: string
let pluginsDir: string

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelagent-security-test-'))
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

function zipPluginDir(dir: string): Buffer {
  const zip = new AdmZip()
  zip.addLocalFolder(dir)
  return zip.toBuffer()
}

/** 在 pluginsDir 下预置一个标记为 builtin 的插件目录 */
function seedBuiltinPlugin(pluginId: string): string {
  const dir = makePluginDir(path.join(pluginsDir, pluginId), { id: pluginId })
  fs.mkdirSync(path.join(dir, '.meta'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.meta', 'source'), 'builtin')
  return dir
}

// ---- readManifest 白名单校验（1.1）----

describe('readManifest 校验', () => {
  it('合法清单正常解析', () => {
    const dir = makePluginDir(path.join(workDir, 'src'), { displayName: '演示插件', description: 'ok' })
    const manifest = readManifest(dir)
    expect(manifest).toBeDefined()
    expect(manifest!.pluginId).toBe('demo-plugin')
    expect(manifest!.displayName).toBe('演示插件')
    expect(manifest!.version).toBe('1.0.0')
  })

  it('拒绝路径穿越型 pluginId（../evil）', () => {
    const dir = makePluginDir(path.join(workDir, 'src'), { id: '../evil' })
    expect(() => readManifest(dir)).toThrow(/非法插件 id/)
  })

  it('拒绝大写/下划线/空格等非法 pluginId', () => {
    for (const id of ['Outline-Gen', 'outline_gen', 'outline generator', '-outline', '']) {
      const dir = makePluginDir(path.join(workDir, 'src'), { id })
      expect(() => readManifest(dir), `id=${JSON.stringify(id)}`).toThrow(/非法插件 id/)
    }
  })

  it('拒绝非字符串 displayName（M6：数字类型）', () => {
    const dir = makePluginDir(path.join(workDir, 'src'), { displayName: 123 })
    expect(() => readManifest(dir)).toThrow(/displayName/)
  })

  it('拒绝非字符串 description', () => {
    const dir = makePluginDir(path.join(workDir, 'src'), { description: { a: 1 } })
    expect(() => readManifest(dir)).toThrow(/description/)
  })

  it('拒绝非法 semver 版本号（H3：../../y 与非 semver）', () => {
    for (const version of ['../../y', 'not-semver', '1.0.0.0']) {
      const dir = makePluginDir(path.join(workDir, 'src'), {}, { version })
      expect(() => readManifest(dir), `version=${version}`).toThrow(/version/)
    }
  })

  it('缺失 version 字段时拒绝（不再默认 0.0.0）', () => {
    const dir = makePluginDir(path.join(workDir, 'src'), {}, { version: undefined })
    expect(() => readManifest(dir)).toThrow(/version/)
  })
})

// ---- 安装路径防护（1.3 / 1.4）----

describe('installPluginFromZip 安全防护', () => {
  it('正常 zip 安装成功并写入元数据', () => {
    const srcDir = makePluginDir(path.join(workDir, 'src'), { displayName: '演示插件' })
    const manifest = installPluginFromZip(zipPluginDir(srcDir), pluginsDir, 'LOCAL', () => {})

    expect(manifest.pluginId).toBe('demo-plugin')
    const targetDir = path.join(pluginsDir, 'demo-plugin')
    expect(fs.existsSync(path.join(targetDir, 'package.json'))).toBe(true)
    expect(fs.existsSync(path.join(targetDir, 'dist', 'index.js'))).toBe(true)
    expect(fs.readFileSync(path.join(targetDir, '.meta', 'source'), 'utf-8')).toBe('local')
  })

  it('拒绝穿越型 pluginId（../evil），不产生越界目录', () => {
    const srcDir = makePluginDir(path.join(workDir, 'src'), { id: '../evil' })
    expect(() => installPluginFromZip(zipPluginDir(srcDir), pluginsDir, 'LOCAL', () => {})).toThrow(/非法插件 id/)
    // pluginsDir 的上级（workDir）不应出现 evil 目录
    expect(fs.existsSync(path.join(workDir, 'evil'))).toBe(false)
    expect(fs.readdirSync(pluginsDir)).toEqual([])
  })

  it('拒绝抢注覆盖内置插件（outline-generator），原目录不被篡改', () => {
    const builtinDir = seedBuiltinPlugin('outline-generator')
    fs.writeFileSync(path.join(builtinDir, 'dist', 'index.js'), 'module.exports = "original"')

    const srcDir = makePluginDir(path.join(workDir, 'src'), { id: 'outline-generator' })
    try {
      installPluginFromZip(zipPluginDir(srcDir), pluginsDir, 'LOCAL', () => {})
      expect.unreachable('应抛出 BizError')
    } catch (err) {
      expect(err).toBeInstanceOf(BizError)
      expect((err as BizError).code).toBe(ErrorCode.PLUGIN_INSTALL_FORBIDDEN)
    }
    // 内置插件目录内容保持原样
    expect(fs.readFileSync(path.join(builtinDir, 'dist', 'index.js'), 'utf-8')).toBe('module.exports = "original"')
  })

  it('允许覆盖安装非内置的市场/本地插件', () => {
    const v1 = makePluginDir(path.join(workDir, 'src-v1'))
    installPluginFromZip(zipPluginDir(v1), pluginsDir, 'LOCAL', () => {})
    // 第二次安装（模拟更新）不受 builtin 防护影响
    const v2 = makePluginDir(path.join(workDir, 'src-v2'), {}, { version: '2.0.0' })
    const manifest = installPluginFromZip(zipPluginDir(v2), pluginsDir, 'MARKETPLACE', () => {})
    expect(manifest.version).toBe('2.0.0')
    expect(fs.readFileSync(path.join(pluginsDir, 'demo-plugin', '.meta', 'source'), 'utf-8')).toBe('marketplace')
  })

  it('拒绝 zip-slip 条目（../evil.txt）', () => {
    const zip = new AdmZip()
    zip.addFile('package.json', Buffer.from('{}'))
    zip.addFile('evil.txt', Buffer.from('pwned'))
    // adm-zip 的 addFile 会规范化掉 ../，须直接改 entryName 才能构造出攻击样本
    zip.getEntries()[1].entryName = '../evil.txt'
    expect(() => unzipToDir(zip.toBuffer(), path.join(workDir, 'dest'))).toThrow(/非法的压缩包条目路径/)
    expect(fs.existsSync(path.join(workDir, 'evil.txt'))).toBe(false)
  })
})

// ---- zip 资源限制（1.2 / H4）----

describe('unzipToDir 资源限制', () => {
  it('拒绝超过条目数上限的 zip（500）', () => {
    const zip = new AdmZip()
    for (let i = 0; i <= MAX_ZIP_ENTRIES; i++) {
      zip.addFile(`f${i}.txt`, Buffer.from('x'))
    }
    try {
      unzipToDir(zip.toBuffer(), path.join(workDir, 'dest'))
      expect.unreachable('应抛出 BizError')
    } catch (err) {
      expect(err).toBeInstanceOf(BizError)
      expect((err as BizError).code).toBe(ErrorCode.PLUGIN_INSTALL_FAILED)
      expect((err as Error).message).toContain('条目数超限')
    }
  })

  it('拒绝解压总大小超限的 zip（100MB，zip 炸弹）', () => {
    const zip = new AdmZip()
    // 全零数据高压缩比：压缩后很小，但声明解压大小超限
    zip.addFile('bomb.bin', Buffer.alloc(MAX_ZIP_TOTAL_BYTES + 1))
    try {
      unzipToDir(zip.toBuffer(), path.join(workDir, 'dest'))
      expect.unreachable('应抛出 BizError')
    } catch (err) {
      expect(err).toBeInstanceOf(BizError)
      expect((err as BizError).code).toBe(ErrorCode.PLUGIN_INSTALL_FAILED)
      expect((err as Error).message).toContain('总大小超限')
    }
    // 目标目录不应写出了部分文件（预检在任何写盘前拒绝）
    expect(fs.existsSync(path.join(workDir, 'dest', 'bomb.bin'))).toBe(false)
  })

  it('条目数与大小在上限内的 zip 正常解压', () => {
    const zip = new AdmZip()
    zip.addFile('a.txt', Buffer.from('hello'))
    zip.addFile('dir/b.txt', Buffer.from('world'))
    const dest = path.join(workDir, 'dest')
    unzipToDir(zip.toBuffer(), dest)
    expect(fs.readFileSync(path.join(dest, 'a.txt'), 'utf-8')).toBe('hello')
    expect(fs.readFileSync(path.join(dest, 'dir', 'b.txt'), 'utf-8')).toBe('world')
  })
})

// ---- 卸载路径防护（H1 卸载侧）----

describe('uninstallPlugin 安全防护', () => {
  it('拒绝穿越型 pluginId 参数', () => {
    for (const id of ['../evil', '..\\evil', 'a/b']) {
      expect(() => uninstallPlugin(pluginsDir, id, () => {}), `id=${id}`).toThrow(/非法插件 id/)
    }
    expect(fs.existsSync(path.join(workDir, 'evil'))).toBe(false)
  })

  it('正常卸载本地安装的插件', () => {
    const srcDir = makePluginDir(path.join(workDir, 'src'))
    installPluginFromDirectory(srcDir, pluginsDir, 'LOCAL', () => {})
    expect(fs.existsSync(path.join(pluginsDir, 'demo-plugin'))).toBe(true)
    uninstallPlugin(pluginsDir, 'demo-plugin', () => {})
    expect(fs.existsSync(path.join(pluginsDir, 'demo-plugin'))).toBe(false)
  })

  it('拒绝卸载内置插件（原有防护回归）', () => {
    seedBuiltinPlugin('outline-generator')
    expect(() => uninstallPlugin(pluginsDir, 'outline-generator', () => {})).toThrow(/内置插件不可卸载/)
    expect(fs.existsSync(path.join(pluginsDir, 'outline-generator'))).toBe(true)
  })
})
