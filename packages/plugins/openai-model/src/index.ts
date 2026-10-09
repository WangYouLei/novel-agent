import type { Context } from '@novelagent/core'
import { ModelProvider, type ModelRequest, type ModelResponse } from '@novelagent/core'
import { BizError, ErrorCode, estimateTokens } from '@novelagent/shared'

/**
 * OpenAI 模型插件（示例模型插件，PRD 6.2）
 *
 * - 实现 OpenAI 兼容接口（/v1/chat/completions），支持自定义 baseUrl（代理/中转）
 * - 连接参数（API Key / baseUrl / 模型名）由 Web 层从用户 ModelConfig 解密注入
 *   （request.providerOptions），本插件不做任何持久化 —— 用户自己的 Key，不消耗积分（ADR-009）
 * - 服务注册名：model-provider:openai-model（ModelService 按此路由）
 */
export default class OpenAIModelProvider extends ModelProvider {
  readonly extensionId = 'model-provider:openai-model'
  readonly providerId = 'openai-model'
  readonly providerName = 'OpenAI 模型'
  readonly isBuiltin = false as const

  constructor(ctx: Context, _config: Record<string, unknown>) {
    super(ctx, 'model-provider:openai-model', true)
  }

  async chat(request: ModelRequest): Promise<ModelResponse> {
    const opts = request.providerOptions ?? {}
    const apiKey = opts.apiKey
    if (!apiKey) {
      throw new BizError(ErrorCode.MODEL_CONFIG_INVALID, '未配置 API Key，请先在模型设置中填写')
    }
    const baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
    const model = opts.model ?? request.model ?? 'gpt-4o-mini'

    const started = Date.now()
    console.log(`[openai-model] 调用 ${baseUrl}/chat/completions 模型=${model}`)

    const messages: Array<{ role: string; content: string }> = []
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt })
    }
    messages.push({ role: 'user', content: request.prompt })

    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: request.maxTokens,
          temperature: request.temperature,
        }),
      })
    } catch (err) {
      throw new BizError(
        ErrorCode.MODEL_CONFIG_INVALID,
        `模型接口无法连接：${(err as Error).message}（请检查 baseUrl 与网络）`,
      )
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new BizError(
        ErrorCode.MODEL_CONFIG_INVALID,
        `模型接口返回 ${response.status}：${body.slice(0, 200)}`,
      )
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const content = data.choices?.[0]?.message?.content ?? ''
    if (!content) {
      throw new BizError(ErrorCode.MODEL_CONFIG_INVALID, '模型返回内容为空')
    }

    console.log(`[openai-model] 调用成功，耗时 ${Date.now() - started}ms`)
    return {
      content,
      inputTokens: data.usage?.prompt_tokens ?? estimateTokens(request.prompt),
      outputTokens: data.usage?.completion_tokens ?? estimateTokens(content),
      model,
      providerId: this.providerId,
    }
  }
}
