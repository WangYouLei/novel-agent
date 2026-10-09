import { Body, Controller, Get, Param, Put, Post, UseGuards } from '@nestjs/common'
import { PluginRegistryService } from '@novelagent/application'
import type { PluginDto, UpdatePluginConfigRequest } from '@novelagent/shared'
import { BizError, ErrorCode } from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { CordisHost } from '../cordis.host'

/**
 * 插件管理控制器（PRD 5.1 / MVP 验收 2、3）：
 * 列表合并三方数据 —— DB 记录（用户级 enabled/config）+ Cordis 运行状态 + manifest schema
 */
@Controller('api/plugins')
@UseGuards(JwtGuard)
export class PluginController {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly cordisHost: CordisHost,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string): Promise<PluginDto[]> {
    // 兜底 seed（登录时 seed 失败的场景）
    await this.pluginRegistry
      .ensureInstalledForUser(userId, this.cordisHost.getManifests())
      .catch(() => undefined)

    const records = await this.pluginRegistry.listForUser(userId)
    return records.map((record) => {
      const runtime = this.cordisHost.runtimes.get(record.pluginId)
      // 运行时状态合成：用户禁用 > 依赖缺失 > 加载错误 > 已启动
      let runtimeStatus: PluginDto['runtimeStatus']
      let missing: string[] = []
      if (!record.enabled) {
        runtimeStatus = 'STOPPED'
      } else if (runtime?.status === 'DEPENDENCY_MISSING') {
        runtimeStatus = 'DEPENDENCY_MISSING'
        missing = runtime.missing ?? []
      } else if (!runtime || runtime.status === 'ERROR') {
        runtimeStatus = 'ERROR'
      } else {
        runtimeStatus = 'STARTED'
      }

      const schema = runtime?.manifest.configSchema ?? []
      return {
        id: record.id,
        pluginId: record.pluginId,
        displayName: runtime?.manifest.displayName ?? record.name,
        version: runtime?.manifest.version ?? record.version,
        author: runtime?.manifest.author ?? record.author,
        description: runtime?.manifest.description ?? record.description,
        type: record.type,
        source: record.source,
        enabled: record.enabled,
        runtimeStatus,
        config: this.pluginRegistry.applyDefaults(schema, (record.config as Record<string, unknown>) ?? {}),
        configSchema: schema,
        missingDependencies: missing,
      }
    })
  }

  /** 启用/禁用（禁用的插件在创作功能中不可见，PRD 5.1；验收标准 2） */
  @Post(':pluginId/enable')
  async enable(@CurrentUser() userId: string, @Param('pluginId') pluginId: string): Promise<void> {
    const manifest = this.cordisHost.getManifest(pluginId)
    if (!manifest) throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, `插件 ${pluginId} 不在本地仓库中`)
    if (this.cordisHost.runtimes.get(pluginId)?.status === 'DEPENDENCY_MISSING') {
      const missing = this.cordisHost.runtimes.get(pluginId)?.missing ?? []
      throw new BizError(ErrorCode.DEPENDENCY_MISSING, `依赖缺失无法启用：${missing.join(', ')}`)
    }
    await this.pluginRegistry.setEnabled(userId, pluginId, true)
    this.cordisHost.root.emit('plugin-status-changed', { pluginId, enabled: true })
  }

  @Post(':pluginId/disable')
  async disable(@CurrentUser() userId: string, @Param('pluginId') pluginId: string): Promise<void> {
    await this.pluginRegistry.setEnabled(userId, pluginId, false)
    this.cordisHost.root.emit('plugin-status-changed', { pluginId, enabled: false })
  }

  /** 更新插件配置（schema 校验后持久化，验收标准 3） */
  @Put(':pluginId/config')
  async updateConfig(
    @CurrentUser() userId: string,
    @Param('pluginId') pluginId: string,
    @Body() body: UpdatePluginConfigRequest,
  ): Promise<Record<string, unknown>> {
    const manifest = this.cordisHost.getManifest(pluginId)
    if (!manifest) throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, `插件 ${pluginId} 不在本地仓库中`)
    return this.pluginRegistry.updateConfig(userId, pluginId, manifest.configSchema, body.config)
  }
}
