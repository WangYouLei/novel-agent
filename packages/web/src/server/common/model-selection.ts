import type { ModelConfigService, PluginRegistryService } from '@novelagent/application'
import type { ModelSelection } from '@novelagent/core'
import { BizError, ErrorCode } from '@novelagent/shared'
import type { CordisHost } from '../cordis.host'

/** 模型选择解析依赖（chat / writing / style-packs 控制器均已注入，直接传入即可） */
export interface ModelSelectionDeps {
  modelConfigService: ModelConfigService
  pluginRegistry: PluginRegistryService
  cordisHost: CordisHost
}

/**
 * 统一模型选择解析（chat / writing / style-packs 三处控制器复用，评审 L17）：
 * - providerId 显式为 'builtin' → 内置免费模型（mock）
 * - modelConfigId 存在 → 用户自定义配置（解密注入连接参数，并校验模型插件可用；
 *   实际 providerId 以配置对应的插件为准，前端无需硬编码插件 id）
 * - 其余缺省情形（providerId 未传且无 modelConfigId）→ 统一走内置（语义对齐 chat 端）
 * - 显式传入非 builtin 的 providerId 但缺 modelConfigId → 400
 *
 * @throws BAD_REQUEST            显式自定义模型未选配置
 * @throws MODEL_CONFIG_INVALID   模型配置不存在
 * @throws PLUGIN_NOT_FOUND       模型插件未安装
 * @throws MODEL_PROVIDER_MISSING 模型插件被禁用或未运行
 */
export async function resolveModelSelection(
  deps: ModelSelectionDeps,
  userId: string,
  providerId: string | undefined,
  modelConfigId: string | undefined,
): Promise<ModelSelection> {
  // 1. 显式内置
  if (providerId === 'builtin') {
    return { providerId: 'builtin', model: 'mock-v1' }
  }

  // 2. 自定义模型：按 modelConfigId 解析（缺省 providerId 时同样以配置为准）
  if (modelConfigId) {
    const config = await deps.modelConfigService.getDecrypted(userId, modelConfigId)

    // 校验对应模型插件可用（验收标准 5：禁用模型插件 → 明确提示缺少模型提供者）
    // 区分"未安装"与"已禁用"两种状态，避免误报（评审 L13）：
    // - 未安装：getByPluginId 抛 PLUGIN_NOT_FOUND → 透出未安装语义的明确提示
    // - 已禁用：正常返回但 enabled=false → 保持现有"已禁用"提示
    const pluginRecord = await deps.pluginRegistry
      .getByPluginId(userId, config.pluginId)
      .catch((err) => {
        if (err instanceof BizError && err.code === ErrorCode.PLUGIN_NOT_FOUND) {
          throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, `模型插件 [${config.pluginId}] 未安装，请先安装`)
        }
        throw err
      })
    if (!pluginRecord.enabled) {
      throw new BizError(
        ErrorCode.MODEL_PROVIDER_MISSING,
        `模型插件 [${config.pluginId}] 已禁用，缺少模型提供者，请先启用`,
      )
    }
    const runtime = deps.cordisHost.runtimes.get(config.pluginId)
    if (!runtime || runtime.status !== 'STARTED') {
      throw new BizError(ErrorCode.MODEL_PROVIDER_MISSING, `模型插件 [${config.pluginId}] 未在运行`)
    }

    return {
      providerId: config.pluginId,
      modelConfigId: config.id,
      model: config.modelName,
      // 连接参数解密注入（API Key 不落日志，ADR 见 model-config 服务）
      providerConfig: {
        apiKey: config.apiKey,
        baseUrl: config.baseUrl ?? undefined,
        model: config.modelName,
      },
    }
  }

  // 3. 缺省：providerId 未传 → 内置（三处控制器原语义不一致，此处统一收敛）
  if (!providerId) {
    return { providerId: 'builtin', model: 'mock-v1' }
  }

  // 4. 显式指定了自定义 providerId 但未选配置
  throw new BizError(ErrorCode.BAD_REQUEST, '使用自定义模型时必须选择模型配置')
}
