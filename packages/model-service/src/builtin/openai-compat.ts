import { BizError, ErrorCode, estimateTokens } from '@novelagent/shared'
import type { ModelRequest, ModelResponse } from '@novelagent/core'

/**
 * OpenAI 兼容接口统一调用客户端（系统固定功能，原 openai-model 插件内化而来）
 * - 覆盖 OpenAI / DeepSeek / Qwen（百炼兼容模式）/ GLM 等厂商的 /chat/completions 接口
 * - 连接参数（API Key / baseUrl / 模型名）由 Web 层从用户 ModelConfig 解密注入
 *   （request.providerOptions），本模块不做任何持久化 —— 用户自己的 Key，不消耗积分（ADR-009）
 */
export async function chatWithOpenAICompat(
  request: ModelRequest,
  providerId: string,
  defaultBaseUrl: string,
): Promise<ModelResponse> {
  const opts = request.providerOptions ?? {}
  const apiKey = opts.apiKey
  if (!apiKey) {
    throw new BizError(ErrorCode.MODEL_CONFIG_INVALID, '未配置 API Key，请先在模型设置中填写')
  }
  const baseUrl = (opts.baseUrl ?? defaultBaseUrl).replace(/\/+$/, '')
  const model = opts.model ?? request.model

  const started = Date.now()
  console.log(`[${providerId}] 调用 ${baseUrl}/chat/completions 模型=${model}`)

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
      // 外部模型调用 120s 超时（全链路超时治理，评审 M8/L7）
      signal: AbortSignal.timeout(120_000),
    })
  } catch (err) {
    // AbortSignal.timeout 超时抛出 name 为 TimeoutError 的 DOMException，转译为用户可读信息
    if ((err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError') {
      throw new BizError(ErrorCode.MODEL_CONFIG_INVALID, '模型接口请求超时（120 秒），请稍后重试')
    }
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

  console.log(`[${providerId}] 调用成功，耗时 ${Date.now() - started}ms`)
  return {
    content,
    inputTokens: data.usage?.prompt_tokens ?? estimateTokens(request.prompt),
    outputTokens: data.usage?.completion_tokens ?? estimateTokens(content),
    model,
    providerId,
  }
}
