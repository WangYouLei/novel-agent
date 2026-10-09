import { estimateTokens } from '@novelagent/shared'
import type { ModelRequest, ModelResponse } from '@novelagent/core'
import { generateMockOutline } from './style-templates'
import { generateMockStylePack } from './style-analyzer'

/**
 * 内置免费模型 provider（纯本地 mock，不调任何外部 API）
 * - 输出为 JSON 文本（与真实模型约定一致，由功能插件解析）
 * - 按提示词中的任务标记路由：大纲生成 / 风格分析（上传小说提取风格包）
 * - 模拟 0.4~1.2s 延迟与 token 统计
 * - 消耗积分（由 ModelService 绑定的 BillingHook 计费）
 */
export class BuiltinMockProvider {
  readonly providerId = 'builtin'
  readonly providerName = '内置免费模型'
  readonly isBuiltin = true as const
  readonly modelName = 'mock-v1'

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const started = Date.now()

    // 模拟网络延迟
    await sleep(400 + Math.floor(Math.random() * 800))

    const isStyleAnalysis = request.prompt.includes('[TASK:style-analysis]')
    const content = isStyleAnalysis
      ? JSON.stringify(generateMockStylePack(request.prompt))
      : JSON.stringify(generateMockOutline(request.prompt))

    return {
      content,
      inputTokens: estimateTokens(request.prompt),
      outputTokens: estimateTokens(content),
      model: this.modelName,
      providerId: this.providerId,
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
