import fs from 'node:fs'
import path from 'node:path'
import { Body, Controller, Get, Inject, Logger, Param, Post, Query, UseGuards } from '@nestjs/common'
import { PluginRegistryService, type AppConfig } from '@novelagent/application'
import {
  findPluginRootDir,
  installPluginFromDirectory,
  type MarketplaceClient,
} from '@novelagent/market-client'
import type {
  InstallFromMarketRequest,
  MarketCategoryDto,
  MarketPage,
  MarketPluginDetailDto,
  MarketPluginDto,
  MarketPluginVersionDto,
  MarketStatusDto,
  MarketUpdateDto,
  PluginInstallResultDto,
} from '@novelagent/shared'
import { BizError, ErrorCode } from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { APP_CONFIG, MARKET_CLIENT } from '../common/tokens'
import { CordisHost } from '../cordis.host'

/**
 * 插件市场控制器（PRD 插件市场：浏览/搜索/安装/更新）：
 * 代理 MarketplaceClient 访问独立市场服务（apps/marketplace），
 * 安装 = 下载 zip → 解压落盘 DATA_ROOT/plugins → CordisHost 热重载 → 登记用户安装记录
 */
@Controller('api/market')
@UseGuards(JwtGuard)
export class MarketController {
  private readonly logger = new Logger('Market')

  constructor(
    @Inject(MARKET_CLIENT) private readonly market: MarketplaceClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly cordisHost: CordisHost,
  ) {}

  /** 市场连通状态（前端据此展示在线/离线） */
  @Get('status')
  async status(): Promise<MarketStatusDto> {
    return {
      available: await this.market.isAvailable(),
      baseUrl: this.market.getBaseUrl(),
    }
  }

  @Get('categories')
  async categories(): Promise<MarketCategoryDto[]> {
    return this.guardMarket(this.market.getCategories())
  }

  @Get('plugins')
  async search(
    @Query('keyword') keyword = '',
    @Query('category') category?: string,
    @Query('page') page = '1',
    @Query('size') size = '20',
  ): Promise<MarketPage<MarketPluginDto>> {
    return this.guardMarket(
      this.market.searchPlugins(keyword, category, Number(page) || 1, Number(size) || 20),
    )
  }

  @Get('plugins/:pluginId')
  async detail(@Param('pluginId') pluginId: string): Promise<MarketPluginDetailDto> {
    const detail = await this.guardMarket(this.market.getPluginDetail(pluginId))
    if (!detail) throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, `市场不存在插件 ${pluginId}`)
    return detail
  }

  /** 插件版本历史（详情对话框按版本安装） */
  @Get('plugins/:pluginId/versions')
  async versions(@Param('pluginId') pluginId: string): Promise<MarketPluginVersionDto[]> {
    return this.guardMarket(this.market.getPluginVersions(pluginId))
  }

  /** 更新检测：以本地已加载清单的版本对比市场最新版本 */
  @Get('updates')
  async updates(): Promise<MarketUpdateDto[]> {
    const installed = this.cordisHost
      .getManifests()
      .map((m) => ({ pluginId: m.pluginId, version: m.version }))
    if (installed.length === 0) return []
    return this.guardMarket(this.market.checkUpdates(installed))
  }

  /** 从市场安装/更新插件并热重载 */
  @Post('install')
  async install(
    @CurrentUser() userId: string,
    @Body() body: InstallFromMarketRequest,
  ): Promise<PluginInstallResultDto> {
    const detail = await this.guardMarket(this.market.getPluginDetail(body.pluginId))
    if (!detail) throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, `市场不存在插件 ${body.pluginId}`)
    const targetVersion = body.version ?? detail.version

    // 已安装相同版本则无需重复安装
    const existing = this.cordisHost.getManifest(body.pluginId)
    if (existing && existing.version === targetVersion) {
      throw new BizError(ErrorCode.BAD_REQUEST, `${detail.displayName} 已是最新版本 ${targetVersion}`)
    }

    const pluginsDir = path.join(this.config.dataRoot, 'plugins')
    let extractDir: string | undefined
    try {
      extractDir = await this.guardMarket(this.market.downloadPlugin(body.pluginId, targetVersion))
      // zip 可能包含一层包装目录，先定位含 package.json 的插件根
      const pluginRoot = findPluginRootDir(extractDir)
      const manifest = installPluginFromDirectory(pluginRoot, pluginsDir, 'MARKETPLACE', (msg) =>
        this.logger.log(msg),
      )
      await this.cordisHost.reload()
      await this.pluginRegistry.installForUser(userId, manifest, 'MARKETPLACE')
      this.cordisHost.root.emit('plugin-status-changed', { pluginId: manifest.pluginId, enabled: true })
      return {
        pluginId: manifest.pluginId,
        displayName: manifest.displayName,
        version: manifest.version,
        runtimeStatus: this.cordisHost.runtimes.get(manifest.pluginId)?.status ?? 'ERROR',
      }
    } catch (err) {
      if (err instanceof BizError) throw err
      throw new BizError(ErrorCode.PLUGIN_INSTALL_FAILED, `插件安装失败：${(err as Error).message}`)
    } finally {
      // 清理下载解压的临时目录
      if (extractDir) fs.rmSync(extractDir, { recursive: true, force: true })
    }
  }

  /** 市场请求统一转译：不可达 → MARKET_UNAVAILABLE */
  private async guardMarket<T>(task: Promise<T>): Promise<T> {
    try {
      return await task
    } catch (err) {
      if (err instanceof BizError) throw err
      throw new BizError(
        ErrorCode.MARKET_UNAVAILABLE,
        `插件市场不可用（${this.market.getBaseUrl()}）：${(err as Error).message}`,
      )
    }
  }
}
