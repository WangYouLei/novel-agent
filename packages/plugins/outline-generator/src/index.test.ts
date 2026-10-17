import { describe, expect, it, vi } from 'vitest'
import { Context, SERVICE_IDS, type FeatureRequest } from '@novelagent/core'
import OutlineGenerator from './index'

/**
 * execute 聚焦单测（批次 6.1）：
 * mock 模型服务（经 Cordis Context 注入，chat() 返回固定 ModelCallResult），
 * 断言 FeatureResult.modelCall 同步带回完整的调用摘要（积分/耗时/Token 等），
 * Web 层无需 sleep 等待异步统计落库。
 */

/** mock chat() 返回的固定模型调用结果（与 ModelCallResult 结构一致） */
const fakeModelCall = {
  content: JSON.stringify({
    title: '测试大纲',
    logline: '废柴少年逆袭的爽文之旅',
    theme: '成长',
    chapters: [
      { no: 1, title: '戒指出世', summary: '少年捡到会说话的戒指。' },
      { no: 2, title: '初露锋芒', summary: '戒指指点少年化解危机。' },
    ],
  }),
  inputTokens: 120,
  outputTokens: 240,
  model: 'mock-v1',
  providerId: 'builtin',
  creditCost: 3,
  durationMs: 456,
}

function makePlugin() {
  const ctx = new Context()
  const chat = vi.fn().mockResolvedValue(fakeModelCall)
  ctx.set(SERVICE_IDS.MODEL, { chat })
  return { plugin: new OutlineGenerator(ctx, {}), chat }
}

function makeRequest(overrides?: Partial<FeatureRequest>): FeatureRequest {
  return {
    userId: 'u1',
    novelId: 'n1',
    sessionId: 's1',
    input: { idea: '废柴少年捡到会说话的戒指，走上逆袭之路' },
    model: { providerId: 'builtin', model: 'mock-v1' },
    config: { chapterCount: 6 },
    ...overrides,
  }
}

describe('OutlineGenerator.execute', () => {
  it('成功路径：FeatureResult.modelCall 同步带回完整调用摘要', async () => {
    const { plugin, chat } = makePlugin()
    const emitProgress = vi.fn()

    const result = await plugin.execute(makeRequest({ emitProgress }))

    expect(result.success).toBe(true)
    expect(result.data).toMatchObject({ title: '测试大纲', logline: '废柴少年逆袭的爽文之旅' })
    // 核心断言：模型调用摘要字段齐全（评审 M4：替代 sleep 后读异步统计）
    expect(result.modelCall).toEqual(fakeModelCall)
    expect(result.modelCall?.creditCost).toBe(3)
    expect(result.modelCall?.durationMs).toBe(456)
    expect(result.modelCall?.inputTokens).toBe(120)
    expect(result.modelCall?.outputTokens).toBe(240)
    // chat 收到的请求与 FeatureRequest 的模型选择一致
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: 'builtin', model: 'mock-v1' }),
    )
  })

  it('模型服务未注册时返回 MODEL_PROVIDER_MISSING 业务错误', async () => {
    const ctx = new Context() // 不注入 model-service
    const plugin = new OutlineGenerator(ctx, {})

    const result = await plugin.execute(makeRequest())

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('MODEL_PROVIDER_MISSING')
  })
})
