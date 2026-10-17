import path from 'node:path'
import { Body, Controller, Get, Inject, Logger, Param, Put, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { PluginRegistryService, type AppConfig } from '@novelagent/application'
import type { PluginDto, PluginInstallResultDto, UpdatePluginConfigRequest } from '@novelagent/shared'
import { BizError, ErrorCode, LIMITS } from '@novelagent/shared'
import {
  installPluginFromZip,
  readInstallSource,
  uninstallPlugin,
} from '@novelagent/market-client'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { APP_CONFIG } from '../common/tokens'
import { CordisHost } from '../cordis.host'

/**
 * 插件管理控制器（PRD 5.1 / MVP 验收 2、3）：
 * 列表合并三方数据 —— DB 记录（用户级 enabled/config）+ Cordis 运行状态 + manifest schema
 * 卸载/本地 zip 安装：操作 DATA_ROOT/plugins 目录后热重载（PRD 插件管理：安装、卸载）
 */
@Controller('api/plugins')
@UseGuards(JwtGuard)
export class PluginController {
  private readonly logger = new Logger('Plugin')

  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly cordisHost: CordisHost,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
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

  /**
   * 卸载插件（PRD 插件管理）：删除插件目录 → 热重载（运行时 dispose）→ 清理所有用户安装记录。
   * 内置插件（随启动同步维护）拒绝卸载
   */
  @Post(':pluginId/uninstall')
  async uninstall(@CurrentUser() _userId: string, @Param('pluginId') pluginId: string): Promise<void> {
    const manifest = this.cordisHost.getManifest(pluginId)
    if (!manifest) throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, `插件 ${pluginId} 不在本地仓库中`)
    if (readInstallSource(manifest.installPath) === 'builtin') {
      throw new BizError(ErrorCode.PLUGIN_UNINSTALL_FORBIDDEN, '内置插件不可卸载')
    }
    try {
      uninstallPlugin(path.join(this.config.dataRoot, 'plugins'), pluginId, (msg) => this.logger.log(msg))
    } catch (err) {
      throw new BizError(ErrorCode.BAD_REQUEST, `卸载失败：${(err as Error).message}`)
    }
    await this.cordisHost.reload()
    const removed = await this.pluginRegistry.removeForAllUsers(pluginId)
    this.logger.log(`插件 ${pluginId} 已卸载（清理 ${removed} 条用户记录）`)
    this.cordisHost.root.emit('plugin-status-changed', { pluginId, enabled: false })
  }

  /** 本地 zip 安装（第三方插件分发场景）：解包落盘 → 热重载 → 登记安装记录 */
  @Post('install-local')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.PLUGIN_ZIP_MAX_BYTES } }))
  async installLocal(
    @CurrentUser() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PluginInstallResultDto> {
    if (!file || !file.buffer?.length) {
      throw new BizError(ErrorCode.BAD_REQUEST, '缺少插件 zip 上传文件（multipart 字段名应为 file）')
    }
    let manifest
    try {
      manifest = installPluginFromZip(
        file.buffer,
        path.join(this.config.dataRoot, 'plugins'),
        'LOCAL',
        (msg) => this.logger.log(msg),
      )
    } catch (err) {
      // 保留底层 BizError 的专用错误码（如内置插件不可覆盖安装 2013）
      if (err instanceof BizError) throw err
      throw new BizError(ErrorCode.PLUGIN_INSTALL_FAILED, `本地插件安装失败：${(err as Error).message}`)
    }
    await this.cordisHost.reload()
    await this.pluginRegistry.installForUser(userId, manifest, 'LOCAL')
    this.cordisHost.root.emit('plugin-status-changed', { pluginId: manifest.pluginId, enabled: true })
    return {
      pluginId: manifest.pluginId,
      displayName: manifest.displayName,
      version: manifest.version,
      runtimeStatus: this.cordisHost.runtimes.get(manifest.pluginId)?.status ?? 'ERROR',
    }
  }
}
