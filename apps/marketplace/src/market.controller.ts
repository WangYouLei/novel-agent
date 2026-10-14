import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { LIMITS } from '@novelagent/shared'
import { MarketRegistryService } from './registry.service'

/**
 * 市场开放 API（文档 6.7 MarketplaceClient 的服务端，供 HttpMarketplaceClient 消费）：
 * 直连裸 JSON + HTTP 状态码（不经 ApiResponse 包装，主应用 Web 端负责对前端转译）
 */
@Controller('api/market')
export class MarketController {
  // tsx(esbuild) 不生成 design:paramtypes，显式 @Inject 保证 dev 模式注入（self:paramtypes）
  constructor(@Inject(MarketRegistryService) private readonly registry: MarketRegistryService) {}

  @Get('health')
  health(): { status: string; time: string } {
    return { status: 'ok', time: new Date().toISOString() }
  }

  @Get('categories')
  categories() {
    return this.registry.getCategories()
  }

  /** 搜索：keyword 匹配 pluginId/名称/描述，category 为插件类型 */
  @Get('plugins')
  search(
    @Query('keyword') keyword = '',
    @Query('category') category?: string,
    @Query('page') page = '1',
    @Query('size') size = '20',
  ) {
    const pageNum = Math.max(1, Number(page) || 1)
    const sizeNum = Math.min(LIMITS.MARKET_PAGE_MAX_SIZE, Math.max(1, Number(size) || 20))
    return this.registry.search(keyword, category, pageNum, sizeNum)
  }

  @Get('plugins/:pluginId')
  detail(@Param('pluginId') pluginId: string) {
    const detail = this.registry.getDetail(pluginId)
    if (!detail) throw new NotFoundException(`市场不存在插件 ${pluginId}`)
    return detail
  }

  @Get('plugins/:pluginId/versions')
  versions(@Param('pluginId') pluginId: string) {
    const versions = this.registry.getVersions(pluginId)
    if (versions.length === 0) throw new NotFoundException(`市场不存在插件 ${pluginId}`)
    return versions
  }

  /** 下载插件包（缺省最新版本），zip 附件流 */
  @Get('plugins/:pluginId/download')
  download(
    @Param('pluginId') pluginId: string,
    @Query('version') version?: string,
    @Res({ passthrough: true }) res?: Response,
  ): StreamableFile {
    try {
      const { buffer, filename } = this.registry.getZip(pluginId, version)
      res?.setHeader('Content-Type', 'application/zip')
      res?.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      return new StreamableFile(buffer)
    } catch (err) {
      throw new NotFoundException((err as Error).message)
    }
  }

  /** 批量更新检测：body { installed: [{ pluginId, version }] } */
  @Post('updates')
  @HttpCode(200)
  updates(@Body() body: { installed?: Array<{ pluginId: string; version: string }> }) {
    return this.registry.checkUpdates(body.installed ?? [])
  }

  /** 发布插件 zip（multipart 字段名 file；内存暂存 + 大小上限） */
  @Post('publish')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: LIMITS.PLUGIN_ZIP_MAX_BYTES } }))
  publish(@UploadedFile() file: Express.Multer.File | undefined, @Body('changelog') changelog?: string) {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('缺少上传文件（multipart 字段名应为 file）')
    }
    return this.registry.publish(file.buffer, changelog)
  }
}
