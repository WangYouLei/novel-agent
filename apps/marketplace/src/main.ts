import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { MarketModule } from './market.module'

/**
 * 插件市场服务入口（独立进程，主应用经 HttpMarketplaceClient 访问）：
 * - 端口：环境变量 MARKET_PORT，默认 3100
 * - 数据目录：环境变量 MARKET_DATA_ROOT，默认仓库根 marketplace-data/
 * - 启动时自动 seed monorepo 官方插件（幂等），第三方插件经 /api/market/publish 发布
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(MarketModule)
  const logger = new Logger('Marketplace')
  app.enableCors()

  const port = Number(process.env.MARKET_PORT ?? 3100)
  await app.listen(port)
  logger.log(`插件市场服务已启动：http://localhost:${port}`)

  // 优雅退出
  const shutdown = async (signal: string) => {
    logger.log(`收到 ${signal}，正在关闭...`)
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  console.error('[marketplace] 启动失败：', err)
  process.exit(1)
})
