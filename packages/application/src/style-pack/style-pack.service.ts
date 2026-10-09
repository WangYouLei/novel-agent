import type { PrismaClient } from '@prisma/client'
import {
  BizError,
  ErrorCode,
  type StylePackDto,
  type StylePackContent,
  type UpdateStylePackRequest,
} from '@novelagent/shared'
import { BUILTIN_STYLE_PACKS } from './builtin-packs'

/**
 * 风格包管理：三级供给体系（内置只读 / 用户生成可改 / 第三方可改，PRD 3.3）
 * 内置包由 seed 幂等写入（builtinKey 唯一），用户可 fork 后修改
 */
export class StylePackService {
  constructor(private readonly prisma: PrismaClient) {}

  /** 列表：内置 + 当前用户的（PRD 5.3 可选来源） */
  async list(userId: string): Promise<StylePackDto[]> {
    const packs = await this.prisma.stylePack.findMany({
      where: {
        deleted: false,
        OR: [{ userId: null }, { userId }],
      },
      orderBy: [{ sourceType: 'asc' }, { createdAt: 'asc' }],
    })
    return packs.map((p) => this.toDto(p))
  }

  async getById(userId: string, id: string): Promise<StylePackDto> {
    const pack = await this.prisma.stylePack.findFirst({
      where: { id, deleted: false, OR: [{ userId: null }, { userId }] },
    })
    if (!pack) throw new BizError(ErrorCode.STYLE_PACK_NOT_FOUND, '风格包不存在')
    return this.toDto(pack)
  }

  /** 更新：内置包只读（modifiable=false），其余可改 */
  async update(userId: string, id: string, req: UpdateStylePackRequest): Promise<StylePackDto> {
    const pack = await this.getOwned(userId, id)
    if (!pack.modifiable) {
      throw new BizError(ErrorCode.FORBIDDEN, '内置风格包只读，可复制后修改')
    }
    const updated = await this.prisma.stylePack.update({
      where: { id },
      data: {
        name: req.name,
        description: req.description,
        content: req.content as never,
      },
    })
    return this.toDto(updated)
  }

  /** 保存插件生成的风格包（用户生成级，可自由修改，PRD 3.4） */
  async createGenerated(
    userId: string,
    name: string,
    content: StylePackContent,
    pluginId: string,
  ): Promise<StylePackDto> {
    const created = await this.prisma.stylePack.create({
      data: {
        userId,
        name,
        description: '由风格提取插件从上传小说中分析生成',
        sourceType: 'USER_GENERATED',
        generatedBy: pluginId,
        sourcePluginId: pluginId,
        modifiable: true,
        content: content as never,
      },
    })
    return this.toDto(created)
  }

  /** 复制（fork）：内置包 → 用户生成包，可自由修改（PRD 3.3"可复制后修改"） */
  async fork(userId: string, id: string): Promise<StylePackDto> {
    const pack = await this.prisma.stylePack.findFirst({
      where: { id, deleted: false, OR: [{ userId: null }, { userId }] },
    })
    if (!pack) throw new BizError(ErrorCode.STYLE_PACK_NOT_FOUND, '风格包不存在')

    const created = await this.prisma.stylePack.create({
      data: {
        userId,
        name: `${pack.name}（副本）`,
        description: pack.description,
        sourceType: 'USER_GENERATED',
        generatedBy: 'fork',
        // Prisma 的 Json 读取类型（JsonValue）不能直接回写，需经深拷贝转为输入类型
        content: JSON.parse(JSON.stringify(pack.content)) as never,
        forkedFromId: pack.id,
        modifiable: true,
      },
    })
    return this.toDto(created)
  }

  /** 软删除：仅允许删除用户自建包 */
  async remove(userId: string, id: string): Promise<void> {
    const pack = await this.getOwned(userId, id)
    if (pack.sourceType === 'BUILTIN') {
      throw new BizError(ErrorCode.FORBIDDEN, '内置风格包不可删除')
    }
    await this.prisma.stylePack.update({ where: { id }, data: { deleted: true } })
  }

  /** 获取小说当前生效的风格包（创作链路使用；novel 未选则返回 undefined 走兜底） */
  async getForNovel(novelId: string): Promise<StylePackDto | null> {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      include: { stylePack: true },
    })
    if (!novel?.stylePack || novel.stylePack.deleted) return null
    return this.toDto(novel.stylePack)
  }

  private async getOwned(userId: string, id: string) {
    const pack = await this.prisma.stylePack.findFirst({ where: { id, deleted: false, userId } })
    if (!pack) throw new BizError(ErrorCode.STYLE_PACK_NOT_FOUND, '风格包不存在或不属于当前用户')
    return pack
  }

  /** 启动 seed：内置风格包幂等写入（按 builtinKey upsert，保持内容与代码一致） */
  async seedBuiltinPacks(): Promise<number> {
    for (const def of BUILTIN_STYLE_PACKS) {
      await this.prisma.stylePack.upsert({
        where: { builtinKey: def.builtinKey },
        create: {
          builtinKey: def.builtinKey,
          name: def.name,
          description: def.description,
          sourceType: 'BUILTIN',
          modifiable: false,
          content: def.content as never,
        },
        update: {
          name: def.name,
          description: def.description,
          content: def.content as never,
        },
      })
    }
    return BUILTIN_STYLE_PACKS.length
  }

  private toDto(p: {
    id: string
    builtinKey: string | null
    name: string
    description: string | null
    sourceType: string
    version: string
    modifiable: boolean
    content: unknown
    forkedFromId: string | null
    createdAt: Date
  }): StylePackDto {
    return {
      id: p.id,
      builtinKey: p.builtinKey,
      name: p.name,
      description: p.description,
      sourceType: p.sourceType as StylePackDto['sourceType'],
      version: p.version,
      modifiable: p.modifiable,
      content: p.content as StylePackContent,
      forkedFromId: p.forkedFromId,
      createdAt: p.createdAt.toISOString(),
    }
  }
}
