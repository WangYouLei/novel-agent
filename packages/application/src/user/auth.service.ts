import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { PrismaClient, User } from '@prisma/client'
import {
  BizError,
  ErrorCode,
  LIMITS,
  CREDIT_POLICY,
  type UserDto,
  type CreditLogDto,
  type DailyClaimResult,
} from '@novelagent/shared'
import type { AppConfig } from '../config'

/**
 * 用户与认证服务：注册 / 登录（JWT）/ 每日积分领取 / 积分流水
 * 技术决策：JWT 无状态认证（HTTP Header + WebSocket 握手带 token）
 */
export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
  ) {}

  /** 注册：用户名唯一，密码 bcrypt 哈希，赠送注册积分 */
  async register(username: string, password: string): Promise<UserDto> {
    if (username.length < LIMITS.USERNAME_MIN || username.length > LIMITS.USERNAME_MAX) {
      throw new BizError(ErrorCode.BAD_REQUEST, `用户名长度需在 ${LIMITS.USERNAME_MIN}-${LIMITS.USERNAME_MAX} 之间`)
    }
    if (password.length < LIMITS.PASSWORD_MIN) {
      throw new BizError(ErrorCode.BAD_REQUEST, `密码至少 ${LIMITS.PASSWORD_MIN} 位`)
    }

    const existing = await this.prisma.user.findUnique({ where: { username } })
    if (existing) {
      throw new BizError(ErrorCode.USERNAME_TAKEN, '用户名已被占用')
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        credits: CREDIT_POLICY.REGISTER_BONUS,
      },
    })
    // 注册赠送积分记入流水
    await this.prisma.creditLog.create({
      data: {
        userId: user.id,
        amount: CREDIT_POLICY.REGISTER_BONUS,
        type: 'ADMIN_ADJUST',
        description: '注册赠送',
      },
    })
    return this.toUserDto(user)
  }

  /** 登录：校验密码，签发 JWT */
  async login(username: string, password: string): Promise<{ token: string; user: UserDto }> {
    const user = await this.prisma.user.findUnique({ where: { username } })
    if (!user || !user.passwordHash) {
      throw new BizError(ErrorCode.INVALID_CREDENTIALS, '用户名或密码错误')
    }
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      throw new BizError(ErrorCode.INVALID_CREDENTIALS, '用户名或密码错误')
    }
    const token = this.signToken(user.id)
    return { token, user: this.toUserDto(user) }
  }

  signToken(userId: string): string {
    return jwt.sign({ sub: userId }, this.config.jwtSecret, { expiresIn: '7d' })
  }

  /** 校验 JWT，返回 userId；无效时抛 401 */
  verifyToken(token: string): string {
    try {
      const payload = jwt.verify(token, this.config.jwtSecret) as { sub: string }
      return payload.sub
    } catch {
      throw new BizError(ErrorCode.UNAUTHORIZED, '登录已过期，请重新登录')
    }
  }

  async getUserById(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deleted: false } })
    if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在')
    return this.toUserDto(user)
  }

  /** 每日领取免费积分（按自然日幂等，PRD：每日可领取） */
  async claimDaily(userId: string): Promise<DailyClaimResult> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在')

    const now = new Date()
    if (user.lastDailyClaim) {
      const last = new Date(user.lastDailyClaim)
      const sameDay =
        last.getFullYear() === now.getFullYear() &&
        last.getMonth() === now.getMonth() &&
        last.getDate() === now.getDate()
      if (sameDay) {
        throw new BizError(ErrorCode.DAILY_ALREADY_CLAIMED, '今天已领取过每日积分')
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          credits: { increment: CREDIT_POLICY.DAILY_CLAIM_AMOUNT },
          lastDailyClaim: now,
        },
      }),
      this.prisma.creditLog.create({
        data: {
          userId,
          amount: CREDIT_POLICY.DAILY_CLAIM_AMOUNT,
          type: 'DAILY_GIFT',
          description: '每日领取',
        },
      }),
    ])
    return { claimed: CREDIT_POLICY.DAILY_CLAIM_AMOUNT, credits: updated.credits }
  }

  async listCreditLogs(userId: string, page = 1, pageSize = 20): Promise<CreditLogDto[]> {
    const logs = await this.prisma.creditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    })
    return logs.map((l) => ({
      id: l.id,
      amount: l.amount,
      type: l.type,
      description: l.description,
      createdAt: l.createdAt.toISOString(),
    }))
  }

  toUserDto(user: User): UserDto {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      credits: user.credits,
      vipExpiresAt: user.vipExpiresAt ? user.vipExpiresAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    }
  }
}
