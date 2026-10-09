import type { PrismaClient } from '@prisma/client'
import { BizError, ErrorCode } from '@novelagent/shared'

/**
 * 计费服务：模型调用扣费 / 失败退费 / 流水查询
 * 是 model-service 计费 hook（BillingHook）在应用层的实现（文档 5.2）
 */
export class BillingService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 调用前扣费：余额不足抛 INSUFFICIENT_CREDITS
   * @returns 扣费流水 id
   */
  async chargeForModelCall(params: {
    userId: string
    modelCallId?: string
    amount: number
    description: string
  }): Promise<string> {
    if (params.amount <= 0) return ''

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: params.userId } })
      if (!user) throw new BizError(ErrorCode.NOT_FOUND, '用户不存在')
      if (user.credits < params.amount) {
        throw new BizError(ErrorCode.INSUFFICIENT_CREDITS, `积分不足（当前 ${user.credits}，需要 ${params.amount}）`)
      }
      await tx.user.update({
        where: { id: params.userId },
        data: { credits: { decrement: params.amount } },
      })
      const log = await tx.creditLog.create({
        data: {
          userId: params.userId,
          amount: -params.amount,
          type: 'MODEL_CALL',
          description: params.description,
          modelCallId: params.modelCallId,
        },
      })
      return log.id
    })
  }

  /** 调用失败退费（文档 5.2 BillingHook.refund） */
  async refund(params: {
    userId: string
    modelCallId?: string
    amount: number
    reason: string
  }): Promise<void> {
    if (params.amount <= 0) return
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: params.userId },
        data: { credits: { increment: params.amount } },
      }),
      this.prisma.creditLog.create({
        data: {
          userId: params.userId,
          amount: params.amount,
          type: 'REFUND',
          description: `调用失败退费：${params.reason}`,
          modelCallId: params.modelCallId,
        },
      }),
    ])
  }
}
