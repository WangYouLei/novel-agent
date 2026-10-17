import { afterEach, describe, expect, it, vi } from 'vitest'
import { BizError, ErrorCode } from '@novelagent/shared'
import OpenAIModelProvider from './index'
import type { ModelRequest } from '@novelagent/core'

/**
 * 外部模型调用超时单测（批次 6.2，评审 M8/L7）：
 * mock 全局 fetch 验证两件事——
 * 1. 请求透传了 AbortSignal.timeout(120s) 的 signal（超时控制真实接线）
 * 2. 超时抛出的 TimeoutError 被转译为用户可读的业务错误（不裸抛英文 DOMException）
 */

/** 构造最小请求（providerOptions 带 API Key，跳过参数校验） */
function makeRequest(): ModelRequest {
  return {
    prompt: '写一个开头',
    model: 'gpt-test',
    providerId: 'openai-model',
    providerOptions: { apiKey: 'sk-test', baseUrl: 'https://api.example.com/v1' },
  }
}

/** 不经构造函数创建实例（chat 只消费 providerOptions，不依赖 Cordis 宿主） */
const provider = Object.create(OpenAIModelProvider.prototype) as OpenAIModelProvider

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)
afterEach(() => fetchMock.mockReset())

describe('OpenAIModelProvider.chat 超时', () => {
  it('fetch 请求携带 AbortSignal（超时控制接线）', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '好的' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 },
      ),
    )

    await provider.chat(makeRequest())

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('超时（TimeoutError）转译为用户可读业务错误', async () => {
    // AbortSignal.timeout 超时时 fetch 以 name=TimeoutError 的 DOMException 拒绝
    fetchMock.mockRejectedValue(
      Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
    )

    const err = await provider.chat(makeRequest()).catch((e) => e)

    expect(err).toBeInstanceOf(BizError)
    expect((err as BizError).code).toBe(ErrorCode.MODEL_CONFIG_INVALID)
    expect((err as BizError).message).toContain('请求超时')
  })
})
