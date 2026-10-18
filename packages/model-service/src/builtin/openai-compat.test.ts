import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BizError, ErrorCode } from '@novelagent/shared'
import type { ModelRequest } from '@novelagent/core'
import { chatWithOpenAICompat } from './openai-compat'

/**
 * OpenAI 兼容客户端单测（系统固定模型接入能力，原 openai-model 插件内化）：
 * - 成功解析 choices/usage；缺 Key / 超时 / 非 2xx / 空内容 → MODEL_CONFIG_INVALID
 * - baseUrl 去尾斜杠、providerOptions.model 覆盖 request.model、默认 baseUrl 回退
 */

function makeRequest(overrides?: Partial<ModelRequest>): ModelRequest {
  return {
    prompt: '写一个大纲',
    model: 'deepseek-chat',
    providerId: 'deepseek',
    ...overrides,
  }
}

function okResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('chatWithOpenAICompat', () => {
  it('成功返回内容与 token 统计，携带 providerId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({
        choices: [{ message: { content: '{"title":"测试"}' } }],
        usage: { prompt_tokens: 11, completion_tokens: 7 },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await chatWithOpenAICompat(
      makeRequest({ providerOptions: { apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1' } }),
      'deepseek',
      'https://api.deepseek.com/v1',
    )

    expect(result).toMatchObject({
      content: '{"title":"测试"}',
      inputTokens: 11,
      outputTokens: 7,
      model: 'deepseek-chat',
      providerId: 'deepseek',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test')
    vi.unstubAllGlobals()
  })

  it('缺 API Key → MODEL_CONFIG_INVALID', async () => {
    await expect(chatWithOpenAICompat(makeRequest(), 'deepseek', 'https://api.deepseek.com/v1')).rejects.toMatchObject(
      { code: ErrorCode.MODEL_CONFIG_INVALID },
    )
  })

  it('baseUrl 去尾斜杠后拼接，未传时回退默认 baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ choices: [{ message: { content: 'ok' } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await chatWithOpenAICompat(
      makeRequest({ providerOptions: { apiKey: 'sk-test' } }),
      'glm',
      'https://open.bigmodel.cn/api/paas/v4/',
    )

    expect(fetchMock.mock.calls[0][0]).toBe('https://open.bigmodel.cn/api/paas/v4/chat/completions')
    vi.unstubAllGlobals()
  })

  it('providerOptions.model 覆盖请求模型名', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okResponse({ choices: [{ message: { content: 'ok' } }] }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await chatWithOpenAICompat(
      makeRequest({ providerOptions: { apiKey: 'sk-test', model: 'qwen-max' } }),
      'qwen',
      'https://dashscope.aliyuncs.com/compatible-mode/v1',
    )

    expect(result.model).toBe('qwen-max')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.model).toBe('qwen-max')
    vi.unstubAllGlobals()
  })

  it('超时（TimeoutError）→ 用户可读的超时提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
    )
    await expect(
      chatWithOpenAICompat(
        makeRequest({ providerOptions: { apiKey: 'sk-test' } }),
        'deepseek',
        'https://api.deepseek.com/v1',
      ),
    ).rejects.toMatchObject({ code: ErrorCode.MODEL_CONFIG_INVALID, message: expect.stringContaining('超时') })
    vi.unstubAllGlobals()
  })

  it('非 2xx 响应 → 携带状态码的 MODEL_CONFIG_INVALID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'invalid api key',
      } as unknown as Response),
    )
    const err = await chatWithOpenAICompat(
      makeRequest({ providerOptions: { apiKey: 'sk-bad' } }),
      'deepseek',
      'https://api.deepseek.com/v1',
    ).catch((e) => e)
    expect(err).toBeInstanceOf(BizError)
    expect(err.code).toBe(ErrorCode.MODEL_CONFIG_INVALID)
    expect(err.message).toContain('401')
    vi.unstubAllGlobals()
  })

  it('返回内容为空 → MODEL_CONFIG_INVALID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse({ choices: [{ message: {} }] })),
    )
    await expect(
      chatWithOpenAICompat(
        makeRequest({ providerOptions: { apiKey: 'sk-test' } }),
        'deepseek',
        'https://api.deepseek.com/v1',
      ),
    ).rejects.toMatchObject({ code: ErrorCode.MODEL_CONFIG_INVALID, message: expect.stringContaining('为空') })
    vi.unstubAllGlobals()
  })
})
