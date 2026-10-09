import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { BizError, ErrorCode, type ApiResponse } from '@novelagent/shared'
import type { Response } from 'express'

/**
 * 全局异常过滤器：把所有异常转译为统一的 ApiResponse 结构
 * - BizError：业务错误（携带错误码）
 * - HttpException：Nest HTTP 异常
 * - 其他：内部错误（不泄漏堆栈给前端，只记日志）
 */
@Catch()
export class BizErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let payload: ApiResponse<null>

    if (exception instanceof BizError) {
      status = exception.code >= 400 && exception.code < 500 ? exception.code : HttpStatus.BAD_REQUEST
      payload = { code: exception.code, message: exception.message, data: null }
      this.logger.warn(`业务错误 [${exception.code}] ${exception.message}`)
    } else if (exception instanceof HttpException) {
      status = exception.getStatus()
      const body = exception.getResponse()
      const message =
        typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message)
      payload = { code: status, message, data: null }
      this.logger.warn(`HTTP ${status} ${message}`)
    } else {
      payload = { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误，请查看日志', data: null }
      this.logger.error(`未处理异常：${(exception as Error).stack ?? exception}`)
    }

    response.status(status).json(payload)
  }
}
