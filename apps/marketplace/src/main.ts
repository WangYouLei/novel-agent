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

  // 优雅退出：成功退出码 0，失败记录日志并以退出码 1 退出（原 void 会吞掉 rejection，评审 L15）
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return // 防重入：信号连续触发只处理一次
    shuttingDown = true
    logger.log(`收到 ${signal}，正在关闭...`)
    await app.close()
    process.exit(0)
  }
  const gracefulShutdown = (signal: string) => {
    shutdown(signal).catch((err) => {
      logger.error(`进程退出失败：${(err as Error).stack ?? err}`)
      process.exit(1)
    })
  }
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

  // 进程级兜底日志：未捕获异常按 Node 最佳实践以退出码 1 退出；未处理 Promise 拒绝仅记录不退出
  process.on('uncaughtException', (err) => {
    logger.error(`未捕获异常：${err.stack ?? err}`)
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    logger.error(`未处理的 Promise 拒绝：${(reason as Error)?.stack ?? reason}`)
  })
}

main().catch((err) => {
  console.error('[marketplace] 启动失败：', err)
  process.exit(1)
})
