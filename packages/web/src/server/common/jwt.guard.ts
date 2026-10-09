import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from '@novelagent/application'

/**
 * JWT 鉴权 Guard（各业务 Controller 通过 @UseGuards(JwtGuard) 启用）
 * 从 Authorization: Bearer <token> 提取并校验，userId 注入 request 供 @CurrentUser() 使用
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { userId?: string }>()
    const header = request.headers.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : undefined
    if (!token) {
      throw new UnauthorizedException('未登录')
    }
    try {
      request.userId = this.authService.verifyToken(token)
      return true
    } catch (err) {
      throw new UnauthorizedException((err as Error).message)
    }
  }
}
