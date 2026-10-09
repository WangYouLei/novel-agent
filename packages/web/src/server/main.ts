import fs from 'node:fs'
import path from 'node:path'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { ApiResponseInterceptor } from './common/response.interceptor'
import { BizErrorFilter } from './common/biz-error.filter'
import { CordisHost } from './cordis.host'
import { BillingService, SessionService, type AppConfig } from '@novelagent/application'
import { CREDIT_POLICY } from '@novelagent/shared'
import type { BillingHook } from '@novelagent/model-service'
import type { ModelRequest } from '@novelagent/core'
import { APP_CONFIG } from './common/tokens'

/**
 * Web 服务入口：
 * - 组装 Nest 应用（全局拦截器/过滤器、静态托管前端、WebSocket 网关）
 * - 给 Cordis ModelService 注入计费 hook（组合 application 的 BillingService）
 * - 导出 bootstrap() 供 launcher 调用；直接运行本文件时自动启动
 */
export async function bootstrap(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const logger = new Logger('Bootstrap')

  // 统一响应结构 + 全局异常转译
  app.useGlobalInterceptors(new ApiResponseInterceptor())
  app.useGlobalFilters(new BizErrorFilter())
  app.enableCors()

  // 计费 hook 定义（注入时机在 listen 之后：CordisHost.onModuleInit 已完成、ModelService 已注册）
  const config = app.get<AppConfig>(APP_CONFIG)
  const billing = app.get(BillingService)
  const sessionService = app.get(SessionService)
  const cordisHost = app.get(CordisHost)

  const billingHook: BillingHook = {
    estimateCost(_request: ModelRequest): number {
      // MVP 定价：大纲生成按次扣费（PRD 第 7 节待定项的默认值，服务端常量可调）
      return CREDIT_POLICY.OUTLINE_GENERATION_COST
    },
    async charge(request: ModelRequest, amount: number, modelCallId?: string) {
      return billing.chargeForModelCall({
        userId: request.metadata?.userId ?? '',
        modelCallId,
        amount,
        description: `模型调用 ${request.model}`,
      })
    },
    async refund(request: ModelRequest, amount: number, reason: string) {
      await billing.refund({
        userId: request.metadata?.userId ?? '',
        amount,
        reason,
      })
    },
  }

  // 生产模式：托管前端构建产物（dist/client，与 server dist 同级）
  const clientDir = path.resolve(__dirname, '../client')
  if (fs.existsSync(clientDir)) {
    app.useStaticAssets(clientDir)
    logger.log(`前端静态资源目录：${clientDir}`)
  }

  // Nest 启动完成（CordisHost.onModuleInit 已加载插件、ModelService 已注册），开始监听
  await app.listen(config.port)

  // 注入计费 hook + 订阅模型调用事件（摘要化写库，ADR-011）
  cordisHost.setBillingHook(billingHook)
  cordisHost.root.on('model-call-finished', (event) => {
    if (!event.sessionId || !event.userId) return
    sessionService
      .recordModelCall({
        sessionId: event.sessionId,
        userId: event.userId,
        modelProvider: event.providerId,
        modelName: event.model,
        input: event.input,
        output: event.output,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        creditCost: event.creditCost,
        status: event.status,
        errorMessage: event.errorMessage,
        durationMs: event.durationMs,
      })
      .catch((err) => logger.error(`模型调用记录失败：${(err as Error).message}`))
  })

  logger.log(`NovelAgent 服务已启动：http://localhost:${config.port}`)
  return app
}

// 直接运行（node dist/server/main.js）时自动启动
if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('启动失败：', err)
    process.exit(1)
  })
}
