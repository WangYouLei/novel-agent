import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator'
import { LIMITS, type LoginRequest, type RegisterRequest } from '@novelagent/shared'

/**
 * 认证模块请求 DTO（class-validator 规则与 LIMITS 常量一致；
 * 校验由 BodyDtoPipe 显式执行，见 dto.pipe.ts）
 */

export class RegisterRequestDto implements RegisterRequest {
  @IsString()
  @IsNotEmpty()
  @MinLength(LIMITS.USERNAME_MIN)
  @MaxLength(LIMITS.USERNAME_MAX)
  username: string

  @IsString()
  @IsNotEmpty()
  @MinLength(LIMITS.PASSWORD_MIN)
  password: string
}

export class LoginRequestDto implements LoginRequest {
  @IsString()
  @IsNotEmpty()
  @MinLength(LIMITS.USERNAME_MIN)
  @MaxLength(LIMITS.USERNAME_MAX)
  username: string

  @IsString()
  @IsNotEmpty()
  @MinLength(LIMITS.PASSWORD_MIN)
  password: string
}
