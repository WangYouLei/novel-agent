import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

/** 共享测试库句柄（后续批次复用，路径与 API 以此为准） */
export interface TestDb {
  /** SQLite 连接串（file: 前缀，指向临时目录内的库文件） */
  url: string
  /** 已连接到临时库的 Prisma 客户端，可直接传给各 Service 构造函数 */
  client: PrismaClient
  /** 断开连接并删除临时目录 */
  cleanup: () => Promise<void>
}

/**
 * 创建临时 SQLite 测试库：临时目录 + db push 同步当前 schema。
 * 测试脚本总是从包目录发起（pnpm --filter / pnpm -r 的生命周期 cwd 为包目录），
 * 因此以 process.cwd() 定位 prisma/schema.prisma。
 */
export async function createTestDb(): Promise<TestDb> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novelagent-test-'))
  const url = `file:${path.join(dir, 'test.db')}`
  const schemaPath = path.resolve(process.cwd(), 'prisma/schema.prisma')

  execSync(`npx prisma db push --skip-generate --schema "${schemaPath}"`, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  })

  const client = new PrismaClient({ datasources: { db: { url } } })
  return {
    url,
    client,
    cleanup: async () => {
      await client.$disconnect()
      fs.rmSync(dir, { recursive: true, force: true })
    },
  }
}
