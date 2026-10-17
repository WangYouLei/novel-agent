import { describe, expect, it, vi } from 'vitest'
import { BizError, ErrorCode } from '@novelagent/shared'
import { resolveModelSelection, type ModelSelectionDeps } from './model-selection'

/**
 * 统一模型选择解析单测（批次 6.4，评审 L17）：
 * - 缺省 providerId 统一收敛为 builtin（原 chat / writing / style-packs 三处语义不一致）
 * - modelConfigId 存在时按配置解析（providerId 以配置对应插件为准，前端无需硬编码插件 id）
 * - 纯 mock 依赖（模型配置服务 / 插件注册表 / Cordis 宿主最小形状），不依赖 Nest 容器
 */

/** 构造最小依赖 mock：自定义配置指向 openai-model 插件 */
function makeDeps(options?: { pluginEnabled?: boolean; runtimeStatus?: string }): ModelSelectionDeps {
  const pluginEnabled = options?.pluginEnabled ?? true
  const runtimeStatus = options?.runtimeStatus ?? 'STARTED'
  return {
    modelConfigService: {
      getDecrypted: vi.fn().mockResolvedValue({
        id: 'cfg-1',
        pluginId: 'openai-model',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-key',
        modelName: 'gpt-test',
      }),
    },
    pluginRegistry: {
      getByPluginId: vi.fn().mockResolvedValue({ enabled: pluginEnabled }),
    },
    cordisHost: {
      runtimes: new Map([['openai-model', { status: runtimeStatus }]]),
    },
  } as unknown as ModelSelectionDeps
}

describe('resolveModelSelection', () => {
  it("providerId 显式 'builtin' → 内置模型，不查模型配置", async () => {
    const deps = makeDeps()
    const selection = await resolveModelSelection(deps, 'u1', 'builtin', undefined)
    expect(selection).toEqual({ providerId: 'builtin', model: 'mock-v1' })
    expect(deps.modelConfigService.getDecrypted).not.toHaveBeenCalled()
  })

  it('providerId 缺省且无 modelConfigId → 统一走内置（缺省语义收敛，对齐 chat 端）', async () => {
    const deps = makeDeps()
    const selection = await resolveModelSelection(deps, 'u1', undefined, undefined)
    expect(selection).toEqual({ providerId: 'builtin', model: 'mock-v1' })
    expect(deps.modelConfigService.getDecrypted).not.toHaveBeenCalled()
  })

  it('providerId 缺省但带 modelConfigId → 按配置解析（前端自定义模式只传配置 id）', async () => {
    const deps = makeDeps()
    const selection = await resolveModelSelection(deps, 'u1', undefined, 'cfg-1')
    expect(selection).toEqual({
      providerId: 'openai-model',
      modelConfigId: 'cfg-1',
      model: 'gpt-test',
      providerConfig: {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.example.com/v1',
        model: 'gpt-test',
      },
    })
  })

  it("providerId 显式传插件 id + modelConfigId → 以配置解析为准（显式值不做校验，兼容旧行为）", async () => {
    const deps = makeDeps()
    const selection = await resolveModelSelection(deps, 'u1', 'openai-model', 'cfg-1')
    expect(selection.providerId).toBe('openai-model')
    expect(selection.modelConfigId).toBe('cfg-1')
  })

  it('providerId 显式传插件 id 但缺 modelConfigId → 400', async () => {
    const deps = makeDeps()
    await expect(resolveModelSelection(deps, 'u1', 'openai-model', undefined)).rejects.toMatchObject({
      name: 'BizError',
      code: ErrorCode.BAD_REQUEST,
    })
  })

  it('模型插件被禁用 → MODEL_PROVIDER_MISSING', async () => {
    const deps = makeDeps({ pluginEnabled: false })
    await expect(resolveModelSelection(deps, 'u1', undefined, 'cfg-1')).rejects.toMatchObject({
      name: 'BizError',
      code: ErrorCode.MODEL_PROVIDER_MISSING,
    })
  })

  it('模型插件未在运行（runtime 非 STARTED）→ MODEL_PROVIDER_MISSING', async () => {
    const deps = makeDeps({ runtimeStatus: 'DEPENDENCY_MISSING' })
    await expect(resolveModelSelection(deps, 'u1', undefined, 'cfg-1')).rejects.toMatchObject({
      name: 'BizError',
      code: ErrorCode.MODEL_PROVIDER_MISSING,
    })
  })

  it('抛出的错误是 BizError 实例（沿用现有异常链路）', async () => {
    const deps = makeDeps({ pluginEnabled: false })
    const err = await resolveModelSelection(deps, 'u1', undefined, 'cfg-1').catch((e) => e)
    expect(err).toBeInstanceOf(BizError)
  })
})
