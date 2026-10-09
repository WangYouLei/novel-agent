import path from 'node:path'
import fs from 'node:fs'
import crypto from 'node:crypto'

/**
 * 应用配置（文档 6.2 DATA_ROOT 解析规则的落地）
 *
 * 解析优先级：
 *   1. 环境变量 NOVELAGENT_DATA_ROOT
 *   2. 仓库根目录下的 data/（开发模式，避免污染用户主目录；打包版改为可执行文件旁 data/）
 *
 * 目录布局（文档 6.2）：
 *   data/
 *   ├── novelagent.db    SQLite 数据库
 *   ├── secret.key       JWT 签名密钥（首次生成）
 *   ├── crypto.key       API Key 加密密钥（首次生成）
 *   ├── files/           二进制资源（预留）
 *   ├── plugins/         插件仓库
 *   ├── styles/          风格包资源（预留）
 *   └── logs/
 */
export interface AppConfig {
  dataRoot: string
  databaseUrl: string
  /** JWT 签名密钥 */
  jwtSecret: string
  /** API Key 加密密钥（32 字节） */
  apiCryptoKey: Buffer
  port: number
}

/** 仓库根目录：application 包位于 packages/application，向上两级 */
function findRepoRoot(): string {
  // dist/db.js 在 dev 下也可能经 tsx 直接运行 src，兼容两种路径
  const marker = 'pnpm-workspace.yaml'
  let dir = path.resolve(__dirname, '../..')
  // 从包目录向上查找 workspace 标记
  for (let i = 0; i < 4; i++) {
    if (fs.existsSync(path.join(dir, marker))) return dir
    dir = path.dirname(dir)
  }
  return path.resolve(__dirname, '../../..')
}

export function loadAppConfig(): AppConfig {
  const repoRoot = findRepoRoot()
  const dataRoot = process.env.NOVELAGENT_DATA_ROOT
    ? path.resolve(process.env.NOVELAGENT_DATA_ROOT)
    : path.join(repoRoot, 'data')

  // 初始化数据目录结构
  for (const sub of ['files', 'plugins', 'styles', 'logs']) {
    fs.mkdirSync(path.join(dataRoot, sub), { recursive: true })
  }

  const jwtSecret = ensureSecretFile(path.join(dataRoot, 'secret.key'), 64)
  const apiCryptoKey = ensureCryptoKey(path.join(dataRoot, 'crypto.key'))

  return {
    dataRoot,
    databaseUrl: `file:${path.join(dataRoot, 'novelagent.db')}`,
    jwtSecret,
    apiCryptoKey,
    port: Number(process.env.PORT ?? 3000),
  }
}

/** 密钥文件不存在时生成随机 hex（幂等），返回 hex 字符串 */
function ensureSecretFile(filePath: string, bytes: number): string {
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (content) return content
  }
  const secret = crypto.randomBytes(bytes).toString('hex')
  fs.writeFileSync(filePath, secret, { mode: 0o600 })
  return secret
}

/**
 * API Key 加密密钥：严格 32 字节（AES-256-GCM 要求）
 * 兼容旧文件（hex 长于 32 字节时截断）
 */
function ensureCryptoKey(filePath: string): Buffer {
  const hex = ensureSecretFile(filePath, 32)
  const key = Buffer.from(hex, 'hex')
  if (key.length < 32) {
    throw new Error(`crypto.key 长度不足（${key.length} 字节，需要 32），请删除后重启自动生成`)
  }
  return key.subarray(0, 32)
}
