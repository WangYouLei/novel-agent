import { describe, expect, it, vi } from 'vitest'
import { BizError, ErrorCode } from '@novelagent/shared'
import { resolveModelSelection, type ModelSelectionDeps } from './model-selection'

/**
 * 统一模型选择解析单测（批次 6.4，评审 L17）：
 * - 缺省 providerId 统一收敛为 builtin（原 chat / writing / style-packs 三处语义不一致）
 * - modelConfigId 存在时按配置解析：系统厂商预设直接可用（不查插件），第三方模型插件走插件校验
 * - 纯 mock 依赖（模型配置服务 / 插件注册表 / Cordis 宿主最小形状），不依赖 Nest 容器
 */

/**
 * 构造最小依赖 mock
 * @param providerId 配置对应的 provider（系统预设 id 或第三方插件 id）
 */
function makeDeps(options?: {
  providerId?: string
  pluginEnabled?: boolean
  pluginInstalled?: boolean
  runtimeStatus?: string
}): ModelSelectionDeps {
  const providerId = options?.providerId ?? 'deepseek'
  const pluginEnabled = options?.pluginEnabled ?? true
  const pluginInstalled = options?.pluginInstalled ?? true
  const runtimeStatus = options?.runtimeStatus ?? 'STARTED'
  return {
    modelConfigService: {
      getDecrypted: vi.fn().mockResolvedValue({
        id: 'cfg-1',
        providerId,
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-key',
        modelName: 'deepseek-test',
      }),
    },
    pluginRegistry: {
      // 未安装：模拟服务层 getByPluginId 抛 PLUGIN_NOT_FOUND；已安装：按 enabled 返回
      getByPluginId: pluginInstalled
        ? vi.fn().mockResolvedValue({ enabled: pluginEnabled })
        : vi.fn().mockRejectedValue(new BizError(ErrorCode.PLUGIN_NOT_FOUND, '插件 未安装')),
    },
    cordisHost: {
      runtimes: new Map([[providerId, { status: runtimeStatus }]]),
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

  it('系统厂商预设（deepseek）+ modelConfigId → 直接解析，不校验插件', async () => {
    const deps = makeDeps({ providerId: 'deepseek' })
    const selection = await resolveModelSelection(deps, 'u1', undefined, 'cfg-1')
    expect(selection).toEqual({
      providerId: 'deepseek',
      modelConfigId: 'cfg-1',
      model: 'deepseek-test',
      providerConfig: {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.example.com/v1',
        model: 'deepseek-test',
      },
    })
    expect(deps.pluginRegistry.getByPluginId).not.toHaveBeenCalled()
  })

  it('第三方模型插件 + modelConfigId → 校验插件启用与运行后解析', async () => {
    const deps = makeDeps({ providerId: 'custom-llm' })
    const selection = await resolveModelSelection(deps, 'u1', undefined, 'cfg-1')
    expect(selection.providerId).toBe('custom-llm')
    expect(selection.modelConfigId).toBe('cfg-1')
    expect(deps.pluginRegistry.getByPluginId).toHaveBeenCalledWith('u1', 'custom-llm')
  })

  it('providerId 显式传非 builtin 但缺 modelConfigId → 400', async () => {
    const deps = makeDeps()
    await expect(resolveModelSelection(deps, 'u1', 'deepseek', undefined)).rejects.toMatchObject({
      name: 'BizError',
      code: ErrorCode.BAD_REQUEST,
    })
  })

  it('第三方模型插件被禁用（已安装）→ MODEL_PROVIDER_MISSING，提示"已禁用"', async () => {
    const deps = makeDeps({ providerId: 'custom-llm', pluginEnabled: false })
    const err = await resolveModelSelection(deps, 'u1', undefined, 'cfg-1').catch((e) => e)
    expect(err).toBeInstanceOf(BizError)
    expect(err.code).toBe(ErrorCode.MODEL_PROVIDER_MISSING)
    expect(err.message).toContain('已禁用')
  })

  it('第三方模型插件未安装（服务抛 PLUGIN_NOT_FOUND）→ PLUGIN_NOT_FOUND，提示"未安装"而非误报"已禁用"', async () => {
    const deps = makeDeps({ providerId: 'custom-llm', pluginInstalled: false })
    const err = await resolveModelSelection(deps, 'u1', undefined, 'cfg-1').catch((e) => e)
    expect(err).toBeInstanceOf(BizError)
    expect(err.code).toBe(ErrorCode.PLUGIN_NOT_FOUND)
    expect(err.message).toContain('未安装')
    expect(err.message).not.toContain('已禁用')
  })

  it('第三方模型插件未在运行（runtime 非 STARTED）→ MODEL_PROVIDER_MISSING', async () => {
    const deps = makeDeps({ providerId: 'custom-llm', runtimeStatus: 'DEPENDENCY_MISSING' })
    await expect(resolveModelSelection(deps, 'u1', undefined, 'cfg-1')).rejects.toMatchObject({
      name: 'BizError',
      code: ErrorCode.MODEL_PROVIDER_MISSING,
    })
  })

  it('抛出的错误是 BizError 实例（沿用现有异常链路）', async () => {
    const deps = makeDeps({ providerId: 'custom-llm', pluginEnabled: false })
    const err = await resolveModelSelection(deps, 'u1', undefined, 'cfg-1').catch((e) => e)
    expect(err).toBeInstanceOf(BizError)
  })
})
