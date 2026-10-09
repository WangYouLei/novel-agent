import { Body, Controller, Delete, Get, Param, Put, Post, UseGuards } from '@nestjs/common'
import { NovelService, StylePackService } from '@novelagent/application'
import type { CreateNovelRequest, NovelDto, UpdateNovelRequest } from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { CordisHost } from '../cordis.host'

/** 小说管理控制器（PRD 5.2：创建小说 → 选风格 → 进入创作） */
@Controller('api/novels')
@UseGuards(JwtGuard)
export class NovelController {
  constructor(
    private readonly novelService: NovelService,
    private readonly stylePackService: StylePackService,
    private readonly cordisHost: CordisHost,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string): Promise<NovelDto[]> {
    return this.novelService.list(userId)
  }

  @Get(':id')
  async getById(@CurrentUser() userId: string, @Param('id') id: string): Promise<NovelDto> {
    return this.novelService.getById(userId, id)
  }

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: CreateNovelRequest): Promise<NovelDto> {
    return this.novelService.create(userId, body)
  }

  @Put(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: UpdateNovelRequest,
  ): Promise<NovelDto> {
    const updated = await this.novelService.update(userId, id, body)
    // 风格包切换广播（前端 Bridge 转发，实时刷新相关插件）
    this.cordisHost.root.emit('style-pack-changed', {
      novelId: id,
      stylePackId: updated.stylePackId,
    })
    return updated
  }

  @Delete(':id')
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.novelService.remove(userId, id)
  }

  /** 小说可用风格包列表（内置 + 我的，PRD 5.3） */
  @Get(':id/style-packs')
  async stylePacks(@CurrentUser() userId: string, @Param('id') _id: string) {
    return this.stylePackService.list(userId)
  }
}
