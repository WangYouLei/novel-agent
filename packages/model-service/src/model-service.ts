import { Service, SERVICE_IDS, type Context, type ModelRequest } from '@novelagent/core'
import type { ModelProvider, ModelResponse } from '@novelagent/core'
import { BizError, ErrorCode } from '@novelagent/shared'
import type { BillingHook } from './billing-hook'
import { BuiltinMockProvider } from './builtin/builtin-provider'

/** chat 的完整结果（含计费与耗时，供调用记录链路使用） */
export interface ModelCallResult extends ModelResponse {
  /** 本次消耗积分（自定义模型恒为 0） */
  creditCost: number
  durationMs: number
}

/**
 * ModelService：统一模型调用入口（文档 5.1 混合模式）
 * - 内置免费模型：绑定计费 hook（先扣费，失败退费）
 * - 插件 provider：按服务名 model-provider:<pluginId> 路由，用户自己的 Key 不计费
 * - 每次调用发布 model-call-finished 事件（Web 层订阅写库，ADR-011）
 */
export class ModelService extends Service {
  private readonly builtin = new BuiltinMockProvider()
  private billingHook: BillingHook | undefined

  constructor(ctx: Context) {
    // immediate=true：服务在插件加载阶段即可被其他插件获取
    super(ctx, SERVICE_IDS.MODEL, true)
  }

  /** 由 Web 启动层注入计费实现（组合 application 的 BillingService） */
  setBillingHook(hook: BillingHook): void {
    this.billingHook = hook
  }

  /**
   * 统一对话入口
   * @throws MODEL_PROVIDER_MISSING 指定的模型提供者不可用（对应验收标准 5 的提示场景）
   * @throws INSUFFICIENT_CREDITS   内置模型余额不足
   */
  async chat(request: ModelRequest): Promise<ModelCallResult> {
    const started = Date.now()
    try {
      const result =
        request.providerId === this.builtin.providerId
          ? await this.callBuiltin(request, started)
          : await this.callPluginProvider(request, started)
      this.emitCallFinished(request, result, 'SUCCESS')
      return result
    } catch (err) {
      this.emitCallFinished(request, undefined, 'FAILED', (err as Error).message)
      throw err
    }
  }

  /** 列出内置提供者（插件 provider 由插件注册表发现，见 PluginController） */
  listBuiltinProviders(): Array<{ providerId: string; providerName: string; isBuiltin: boolean }> {
    return [
      {
        providerId: this.builtin.providerId,
        providerName: this.builtin.providerName,
        isBuiltin: true,
      },
    ]
  }

  private emitCallFinished(
    request: ModelRequest,
    result: ModelCallResult | undefined,
    status: 'SUCCESS' | 'FAILED',
    errorMessage?: string,
  ) {
    // 订阅方（Web 记录层）负责截断摘要；事件本身不落库
    this.ctx.emit('model-call-finished', {
      userId: request.metadata?.userId ?? '',
      sessionId: request.metadata?.sessionId ?? '',
      providerId: request.providerId,
      model: request.model,
      input: request.prompt,
      output: result?.content ?? '',
      inputTokens: result?.inputTokens ?? 0,
      outputTokens: result?.outputTokens ?? 0,
      creditCost: result?.creditCost ?? 0,
      durationMs: result?.durationMs ?? 0,
      status,
      errorMessage,
    })
  }

  private async callBuiltin(request: ModelRequest, started: number): Promise<ModelCallResult> {
    if (!this.billingHook) {
      throw new BizError(ErrorCode.MODEL_PROVIDER_MISSING, '计费服务未初始化，内置模型不可用')
    }
    const cost = this.billingHook.estimateCost(request)
    // 先扣费（余额不足在此抛出，阻止调用）
    await this.billingHook.charge(request, cost)
    try {
      const response = await this.builtin.chat(request)
      return { ...response, creditCost: cost, durationMs: Date.now() - started }
    } catch (err) {
      // 调用失败退费（文档 5.2）
      await this.billingHook.refund(request, cost, (err as Error).message)
      throw err
    }
  }

  private async callPluginProvider(request: ModelRequest, started: number): Promise<ModelCallResult> {
    const provider = this.ctx.get(`model-provider:${request.providerId}`) as ModelProvider | undefined
    if (!provider) {
      throw new BizError(
        ErrorCode.MODEL_PROVIDER_MISSING,
        `模型插件 [${request.providerId}] 未启用，请先在插件管理中开启`,
      )
    }
    const response = await provider.chat(request)
    return { ...response, creditCost: 0, durationMs: Date.now() - started }
  }
}
