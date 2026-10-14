import fs from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'

/**
 * 插件 zip 打包/解包工具（市场下载与本地安装共用）
 * 约定：zip 内为插件目录内容（package.json + dist/ 在 zip 根或唯一一级子目录下）
 */

/** 解压 zip 到目标目录（覆盖式），带 zip-slip 路径校验 */
export function unzipToDir(zipBuffer: Buffer, destDir: string): void {
  fs.rmSync(destDir, { recursive: true, force: true })
  fs.mkdirSync(destDir, { recursive: true })

  const zip = new AdmZip(zipBuffer)
  for (const entry of zip.getEntries()) {
    const entryPath = entry.entryName.replace(/\\/g, '/')
    // 防 zip-slip：拒绝绝对路径与越界相对路径
    const target = path.resolve(destDir, entryPath)
    if (target !== destDir && !target.startsWith(destDir + path.sep)) {
      throw new Error(`非法的压缩包条目路径：${entry.entryName}`)
    }
    if (entry.isDirectory) {
      fs.mkdirSync(target, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, entry.getData())
    }
  }
}

/** 将目录整体打包为 zip Buffer（条目路径相对该目录） */
export function zipDirectory(dir: string): Buffer {
  const zip = new AdmZip()
  zip.addLocalFolder(dir)
  return zip.toBuffer()
}

/**
 * 定位 zip 解压后含 package.json 的插件根目录：
 * 兼容「zip 根即插件目录」与「zip 内包一层目录」两种打包方式
 */
export function findPluginRootDir(extractDir: string): string {
  if (fs.existsSync(path.join(extractDir, 'package.json'))) return extractDir
  const entries = fs
    .readdirSync(extractDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
  for (const entry of entries) {
    const dir = path.join(extractDir, entry.name)
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
  }
  throw new Error('压缩包中未找到 package.json（应为插件目录结构：package.json + dist/）')
}
