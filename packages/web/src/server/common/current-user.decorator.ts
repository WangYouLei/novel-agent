import { type ExecutionContext, createParamDecorator, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'

/** 从请求中取出 JWT 注入的 userId（配合 JwtGuard 使用） */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<Request & { userId?: string }>()
  if (!request.userId) {
    throw new UnauthorizedException('未登录')
  }
  return request.userId
})
