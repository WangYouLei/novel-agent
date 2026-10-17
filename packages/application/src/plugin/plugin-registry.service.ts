import type { PrismaClient } from '@prisma/client'
import {
  BizError,
  ErrorCode,
  type PluginConfigField,
} from '@novelagent/shared'

/**
 * 校验插件配置值是否满足 configSchema 声明（按类型分派，PRD 4.2）：
 * - number：必须是有限数字（拒绝字符串数字 / NaN / Infinity），且在 min/max 范围内
 * - string：必须是字符串（声明了 enum 时还须是可选值之一）
 * - boolean：必须是布尔值
 * - select：必须是字符串且命中 enum 可选值
 * 未提供（null/undefined）的字段跳过（由 applyDefaults 补默认值）；schema 外的未知字段不校验、原样保留
 * @throws BizError(BAD_REQUEST) 校验失败时抛出具体字段与原因
 */
export function validatePluginConfig(
  schema: PluginConfigField[],
  values: Record<string, unknown>,
): void {
  for (const field of schema) {
    const value = values[field.key]
    if (value == null) continue
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BizError(ErrorCode.BAD_REQUEST, `${field.name}必须是数字`)
      }
      if (field.min != null && value < field.min) {
        throw new BizError(ErrorCode.BAD_REQUEST, `${field.name}不能小于 ${field.min}`)
      }
      if (field.max != null && value > field.max) {
        throw new BizError(ErrorCode.BAD_REQUEST, `${field.name}不能大于 ${field.max}`)
      }
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') {
        throw new BizError(ErrorCode.BAD_REQUEST, `${field.name}必须是布尔值`)
      }
    } else if (field.type === 'string' || field.type === 'select') {
      if (typeof value !== 'string') {
        throw new BizError(ErrorCode.BAD_REQUEST, `${field.name}必须是字符串`)
      }
      if (field.enum && !field.enum.includes(value)) {
        throw new BizError(
          ErrorCode.BAD_REQUEST,
          `${field.name}必须是以下之一：${field.enum.join('、')}`,
        )
      }
    }
  }
}

/** 插件目录扫描出的插件元数据（market-client 产出） */
export interface PluginManifest {
  pluginId: string
  displayName: string
  version: string
  type: 'FEATURE' | 'MODEL' | 'STYLE_GENERATOR'
  description?: string
  author?: string
  dependencies: Record<string, string>
  optionalDependencies: Record<string, string>
  configSchema: PluginConfigField[]
  /** 插件目录绝对路径 */
  installPath: string
}

/**
 * 插件注册表：InstalledPlugin 表的领域服务
 * 数据模型上内置插件与第三方插件完全一致（文档 7.3.6），差异仅在 source 字段
 */
export class PluginRegistryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 内置插件 seed：用户首次登录时为其建立插件记录（文档 7.3.6 策略）
   * 幂等：已存在则仅刷新元数据（不动用户的 enabled/config）
   */
  async ensureInstalledForUser(userId: string, manifests: PluginManifest[]): Promise<number> {
    for (const m of manifests) {
      const existing = await this.prisma.installedPlugin.findUnique({
        where: { userId_pluginId: { userId, pluginId: m.pluginId } },
      })
      if (!existing) {
        await this.prisma.installedPlugin.create({
          data: {
            userId,
            pluginId: m.pluginId,
            name: m.displayName,
            version: m.version,
            author: m.author,
            description: m.description,
            type: m.type,
            source: 'BUILTIN',
            installPath: m.installPath,
            status: 'INSTALLED',
            enabled: true,
            config: this.applyDefaults(m.configSchema, {}) as never,
            dependencies: {
              dependencies: m.dependencies,
              optionalDependencies: m.optionalDependencies,
            } as never,
          },
        })
      } else {
        // 刷新元数据与配置 schema 新增字段的默认值（保留用户已有配置）
        await this.prisma.installedPlugin.update({
          where: { id: existing.id },
          data: {
            version: m.version,
            description: m.description,
            installPath: m.installPath,
            dependencies: {
              dependencies: m.dependencies,
              optionalDependencies: m.optionalDependencies,
            } as never,
            config: this.applyDefaults(m.configSchema, (existing.config as Record<string, unknown>) ?? {}) as never,
          },
        })
      }
    }
    return manifests.length
  }

  async listForUser(userId: string) {
    return this.prisma.installedPlugin.findMany({
      where: { userId },
      orderBy: { installedAt: 'asc' },
    })
  }

  /**
   * 市场安装/本地 zip 安装：为用户登记安装记录
   * 与 ensureInstalledForUser（登录 seed，不动 source）区分：此处 source 为本次安装来源，
   * 已存在时刷新元数据并置为启用（重新安装视为显式启用）
   */
  async installForUser(
    userId: string,
    manifest: PluginManifest,
    source: 'LOCAL' | 'MARKETPLACE',
  ): Promise<void> {
    const existing = await this.prisma.installedPlugin.findUnique({
      where: { userId_pluginId: { userId, pluginId: manifest.pluginId } },
    })
    const config = this.applyDefaults(
      manifest.configSchema,
      (existing?.config as Record<string, unknown>) ?? {},
    )
    const metadata = {
      name: manifest.displayName,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      type: manifest.type,
      source,
      installPath: manifest.installPath,
      status: 'INSTALLED' as const,
      enabled: true,
      config: config as never,
      dependencies: {
        dependencies: manifest.dependencies,
        optionalDependencies: manifest.optionalDependencies,
      } as never,
    }
    if (!existing) {
      await this.prisma.installedPlugin.create({
        data: { userId, pluginId: manifest.pluginId, ...metadata },
      })
    } else {
      await this.prisma.installedPlugin.update({
        where: { id: existing.id },
        data: metadata,
      })
    }
  }

  /** 卸载：插件目录已删除，清理所有用户的安装记录（目录为全局共享，单机多用户 MVP 直接全删） */
  async removeForAllUsers(pluginId: string): Promise<number> {
    const result = await this.prisma.installedPlugin.deleteMany({ where: { pluginId } })
    return result.count
  }

  async getByPluginId(userId: string, pluginId: string) {
    const record = await this.prisma.installedPlugin.findUnique({
      where: { userId_pluginId: { userId, pluginId } },
    })
    if (!record) throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, `插件 ${pluginId} 未安装`)
    return record
  }

  /** 启用/禁用（禁用的插件在创作功能中不可见，PRD 5.1） */
  async setEnabled(userId: string, pluginId: string, enabled: boolean) {
    await this.getByPluginId(userId, pluginId)
    await this.prisma.installedPlugin.update({
      where: { userId_pluginId: { userId, pluginId } },
      data: {
        enabled,
        status: enabled ? 'INSTALLED' : 'STOPPED',
      },
    })
  }

  /** 更新用户配置：按 schema 校验类型与数值范围（PRD 4.2，校验规则见 validatePluginConfig） */
  async updateConfig(
    userId: string,
    pluginId: string,
    schema: PluginConfigField[],
    config: Record<string, unknown>,
  ) {
    await this.getByPluginId(userId, pluginId)
    const merged = this.applyDefaults(schema, config)
    validatePluginConfig(schema, merged)
    await this.prisma.installedPlugin.update({
      where: { userId_pluginId: { userId, pluginId } },
      data: { config: merged as never },
    })
    return merged
  }

  /** 将用户配置与 schema 默认值合并（未配置的字段取 default） */
  applyDefaults(
    schema: PluginConfigField[],
    userConfig: Record<string, unknown>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...userConfig }
    for (const field of schema) {
      if (result[field.key] === undefined && field.default !== undefined) {
        result[field.key] = field.default
      }
    }
    return result
  }
}
