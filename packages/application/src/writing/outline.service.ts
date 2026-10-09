import type { PrismaClient } from '@prisma/client'
import { BizError, ErrorCode, type OutlineDto, type OutlineStructure } from '@novelagent/shared'

/**
 * 大纲管理：ADR-007 —— JSON 树整体读写，不做节点级操作
 * MVP 流程：生成 → 保存（version 自增，旧版本置 inactive）
 */
export class OutlineService {
  constructor(private readonly prisma: PrismaClient) {}

  async listByNovel(userId: string, novelId: string): Promise<OutlineDto[]> {
    await this.ensureNovelOwned(userId, novelId)
    const outlines = await this.prisma.outline.findMany({
      where: { novelId, deleted: false },
      orderBy: { version: 'desc' },
    })
    return outlines.map((o) => this.toDto(o))
  }

  /** 保存新大纲：同小说历史版本全部置为 inactive，新版本 version = max + 1 */
  async save(
    userId: string,
    novelId: string,
    structure: OutlineStructure,
    generatedBy?: string,
    generationParams?: Record<string, unknown>,
  ): Promise<OutlineDto> {
    await this.ensureNovelOwned(userId, novelId)

    const last = await this.prisma.outline.findFirst({
      where: { novelId, deleted: false },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    // 事务顺序：[updateMany 置旧版 inactive, create 新版]，取第二个结果
    const [, created] = await this.prisma.$transaction([
      this.prisma.outline.updateMany({ where: { novelId, isActive: true }, data: { isActive: false } }),
      this.prisma.outline.create({
        data: {
          novelId,
          version: (last?.version ?? 0) + 1,
          isActive: true,
          structure: structure as never,
          generatedBy,
          generationParams: generationParams as never,
        },
      }),
    ])
    return this.toDto(created)
  }

  /** 激活历史版本 */
  async activate(userId: string, outlineId: string): Promise<OutlineDto> {
    const outline = await this.prisma.outline.findFirst({
      where: { id: outlineId, deleted: false, novel: { userId } },
    })
    if (!outline) throw new BizError(ErrorCode.NOT_FOUND, '大纲不存在')

    await this.prisma.$transaction([
      this.prisma.outline.updateMany({
        where: { novelId: outline.novelId, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.outline.update({ where: { id: outlineId }, data: { isActive: true } }),
    ])
    const updated = await this.prisma.outline.findUniqueOrThrow({ where: { id: outlineId } })
    return this.toDto(updated)
  }

  private async ensureNovelOwned(userId: string, novelId: string) {
    const novel = await this.prisma.novel.findFirst({ where: { id: novelId, userId, deleted: false } })
    if (!novel) throw new BizError(ErrorCode.NOT_FOUND, '小说不存在')
  }

  private toDto(o: {
    id: string
    novelId: string
    version: number
    isActive: boolean
    structure: unknown
    generatedBy: string | null
    createdAt: Date
  }): OutlineDto {
    return {
      id: o.id,
      novelId: o.novelId,
      version: o.version,
      isActive: o.isActive,
      structure: o.structure as OutlineStructure,
      generatedBy: o.generatedBy,
      createdAt: o.createdAt.toISOString(),
    }
  }
}
