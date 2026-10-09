import type { ModelRequest } from '@novelagent/core'

/**
 * 计费 Hook SPI（文档 5.2）
 * 内置 provider 绑定计费 hook；插件 provider 不绑定（用户自己的 Key，不收费）
 * 由 Web 层在启动时注入实现（内部组合 application 的 BillingService）
 */
export interface BillingHook {
  /** 估算本次调用费用（积分） */
  estimateCost(request: ModelRequest): number
  /**
   * 调用前扣费：余额不足时应抛出业务错误（阻止调用）
   * @returns 扣费流水 id
   */
  charge(request: ModelRequest, amount: number, modelCallId?: string): Promise<string>
  /** 调用失败退费 */
  refund(request: ModelRequest, amount: number, reason: string): Promise<void>
}
