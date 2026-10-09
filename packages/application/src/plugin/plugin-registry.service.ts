import type { PrismaClient } from '@prisma/client'
import {
  BizError,
  ErrorCode,
  type PluginConfigField,
} from '@novelagent/shared'

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

  /** 更新用户配置：按 schema 校验 key 合法性与数值范围（PRD 4.2） */
  async updateConfig(
    userId: string,
    pluginId: string,
    schema: PluginConfigField[],
    config: Record<string, unknown>,
  ) {
    await this.getByPluginId(userId, pluginId)
    const merged = this.applyDefaults(schema, config)
    // 数值范围校验
    for (const field of schema) {
      if (field.type === 'number' && merged[field.key] != null) {
        const v = Number(merged[field.key])
        if (field.min != null && v < field.min) {
          throw new BizError(ErrorCode.BAD_REQUEST, `${field.name} 不能小于 ${field.min}`)
        }
        if (field.max != null && v > field.max) {
          throw new BizError(ErrorCode.BAD_REQUEST, `${field.name} 不能大于 ${field.max}`)
        }
      }
    }
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
