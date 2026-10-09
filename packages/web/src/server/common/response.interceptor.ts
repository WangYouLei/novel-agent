import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { ErrorCode, type ApiResponse } from '@novelagent/shared'
import { map, type Observable } from 'rxjs'

/**
 * 统一响应包装：controller 返回值 → ApiResponse { code, message, data }
 * 与 BizErrorFilter 配合，前端只处理一种响应结构
 */
@Injectable()
export class ApiResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(map((data) => ({ code: ErrorCode.OK, message: 'ok', data })))
  }
}
