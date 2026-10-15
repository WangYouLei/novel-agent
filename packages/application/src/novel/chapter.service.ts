import type { PrismaClient } from '@prisma/client'
import { BizError, ErrorCode, type ChapterDto, type CreateChapterRequest, type UpdateChapterRequest } from '@novelagent/shared'

/**
 * 章节管理：手动编辑小说正文的 CRUD
 * 排序：追加 = max + 100，序号按查询时动态生成（ADR-010）
 */
export class ChapterService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string, novelId: string): Promise<ChapterDto[]> {
    await this.ensureNovelOwned(userId, novelId)
    const chapters = await this.prisma.chapter.findMany({
      where: { novelId, deleted: false },
      orderBy: { sortOrder: 'asc' },
    })
    return chapters.map((c, i) => this.toDto(c, i + 1))
  }

  async create(userId: string, novelId: string, req: CreateChapterRequest): Promise<ChapterDto> {
    await this.ensureNovelOwned(userId, novelId)
    if (!req.title?.trim()) throw new BizError(ErrorCode.BAD_REQUEST, '章节标题不能为空')

    const last = await this.prisma.chapter.findFirst({
      where: { novelId, deleted: false },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    })
    await this.prisma.chapter.create({
      data: {
        novelId,
        sortOrder: (last?.sortOrder ?? 0) + 100,
        title: req.title.trim(),
        summary: req.summary,
        content: req.content,
        wordCount: req.content?.length ?? 0,
      },
    })
    await this.syncNovelWordCount(novelId)
    return (await this.list(userId, novelId)).at(-1)!
  }

  async update(
    userId: string,
    novelId: string,
    chapterId: string,
    req: UpdateChapterRequest,
  ): Promise<ChapterDto> {
    await this.ensureChapterOwned(userId, novelId, chapterId)
    if (req.title !== undefined && !req.title.trim()) {
      throw new BizError(ErrorCode.BAD_REQUEST, '章节标题不能为空')
    }

    await this.prisma.chapter.update({
      where: { id: chapterId },
      data: {
        title: req.title?.trim(),
        summary: req.summary,
        content: req.content,
        status: req.status,
        wordCount: req.content !== undefined ? req.content?.length ?? 0 : undefined,
      },
    })
    await this.syncNovelWordCount(novelId)
    const chapters = await this.list(userId, novelId)
    return chapters.find((c) => c.id === chapterId)!
  }

  async remove(userId: string, novelId: string, chapterId: string): Promise<void> {
    await this.ensureChapterOwned(userId, novelId, chapterId)
    await this.prisma.chapter.update({ where: { id: chapterId }, data: { deleted: true } })
    await this.syncNovelWordCount(novelId)
  }

  private async ensureNovelOwned(userId: string, novelId: string) {
    const novel = await this.prisma.novel.findFirst({ where: { id: novelId, userId, deleted: false } })
    if (!novel) throw new BizError(ErrorCode.NOT_FOUND, '小说不存在')
  }

  private async ensureChapterOwned(userId: string, novelId: string, chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, novelId, deleted: false, novel: { userId } },
    })
    if (!chapter) throw new BizError(ErrorCode.NOT_FOUND, '章节不存在')
    return chapter
  }

  /** 章节变动后同步小说总字数 */
  private async syncNovelWordCount(novelId: string) {
    const agg = await this.prisma.chapter.aggregate({
      where: { novelId, deleted: false },
      _sum: { wordCount: true },
    })
    await this.prisma.novel.update({
      where: { id: novelId },
      data: { wordCount: agg._sum.wordCount ?? 0 },
    })
  }

  private toDto(c: {
    id: string
    novelId: string
    title: string
    summary: string | null
    content: string | null
    wordCount: number
    status: string
    createdAt: Date
    updatedAt: Date
  }, no: number): ChapterDto {
    return {
      id: c.id,
      novelId: c.novelId,
      no,
      title: c.title,
      summary: c.summary,
      content: c.content,
      wordCount: c.wordCount,
      status: c.status as ChapterDto['status'],
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }
  }
}
