import { PrismaClient } from '@prisma/client'
import { loadAppConfig, type AppConfig } from './config'

/**
 * PrismaClient 单例
 * DATABASE_URL 在 PrismaClient 初始化前必须就绪（由 loadAppConfig 计算），
 * 因此统一通过 getDb() 获取，禁止直接 new PrismaClient()
 */
let prisma: PrismaClient | undefined

export function getDb(): PrismaClient {
  if (!prisma) {
    const config = getDbConfig()
    process.env.DATABASE_URL = config.databaseUrl
    prisma = new PrismaClient({
      log: ['warn', 'error'],
    })
  }
  return prisma
}

let cachedConfig: AppConfig | undefined
export function getDbConfig(): AppConfig {
  if (!cachedConfig) cachedConfig = loadAppConfig()
  return cachedConfig
}

export async function disconnectDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = undefined
  }
}
