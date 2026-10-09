import type { PrismaClient } from '@prisma/client'
import { BizError, ErrorCode, type NovelDto, type CreateNovelRequest, type UpdateNovelRequest } from '@novelagent/shared'

/**
 * 小说管理：创建 / 列表 / 更新（含主体风格包选择）/ 软删除
 * 一本小说一个主体风格包（PRD 3.3）
 */
export class NovelService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<NovelDto[]> {
    const novels = await this.prisma.novel.findMany({
      where: { userId, deleted: false },
      orderBy: { updatedAt: 'desc' },
      include: { stylePack: { select: { name: true } } },
    })
    return novels.map((n) => this.toDto(n))
  }

  async getById(userId: string, novelId: string): Promise<NovelDto> {
    const novel = await this.prisma.novel.findFirst({
      where: { id: novelId, userId, deleted: false },
      include: { stylePack: { select: { name: true } } },
    })
    if (!novel) throw new BizError(ErrorCode.NOT_FOUND, '小说不存在')
    return this.toDto(novel)
  }

  async create(userId: string, req: CreateNovelRequest): Promise<NovelDto> {
    if (!req.title?.trim()) throw new BizError(ErrorCode.BAD_REQUEST, '小说标题不能为空')
    if (req.stylePackId) await this.ensureStylePack(req.stylePackId)

    const novel = await this.prisma.novel.create({
      data: {
        userId,
        title: req.title.trim(),
        description: req.description,
        genre: req.genre,
        stylePackId: req.stylePackId,
      },
      include: { stylePack: { select: { name: true } } },
    })
    return this.toDto(novel)
  }

  async update(userId: string, novelId: string, req: UpdateNovelRequest): Promise<NovelDto> {
    await this.ensureOwned(userId, novelId)
    if (req.stylePackId) await this.ensureStylePack(req.stylePackId)

    const novel = await this.prisma.novel.update({
      where: { id: novelId },
      data: {
        title: req.title?.trim(),
        description: req.description,
        genre: req.genre,
        stylePackId: req.stylePackId,
        status: req.status,
      },
      include: { stylePack: { select: { name: true } } },
    })
    return this.toDto(novel)
  }

  async remove(userId: string, novelId: string): Promise<void> {
    await this.ensureOwned(userId, novelId)
    await this.prisma.novel.update({ where: { id: novelId }, data: { deleted: true } })
  }

  private async ensureOwned(userId: string, novelId: string) {
    const novel = await this.prisma.novel.findFirst({ where: { id: novelId, userId, deleted: false } })
    if (!novel) throw new BizError(ErrorCode.NOT_FOUND, '小说不存在')
  }

  private async ensureStylePack(stylePackId: string) {
    const pack = await this.prisma.stylePack.findFirst({ where: { id: stylePackId, deleted: false } })
    if (!pack) throw new BizError(ErrorCode.STYLE_PACK_NOT_FOUND, '风格包不存在')
  }

  private toDto(n: {
    id: string
    title: string
    description: string | null
    genre: string | null
    status: string
    stylePackId: string | null
    wordCount: number
    createdAt: Date
    updatedAt: Date
    stylePack?: { name: string } | null
  }): NovelDto {
    return {
      id: n.id,
      title: n.title,
      description: n.description,
      genre: n.genre,
      status: n.status as NovelDto['status'],
      stylePackId: n.stylePackId,
      stylePackName: n.stylePack?.name ?? null,
      wordCount: n.wordCount,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    }
  }
}
