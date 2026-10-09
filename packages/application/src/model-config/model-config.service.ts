import type { PrismaClient } from '@prisma/client'
import {
  BizError,
  ErrorCode,
  maskApiKey,
  type ModelConfigDto,
  type CreateModelConfigRequest,
  type UpdateModelConfigRequest,
} from '@novelagent/shared'
import type { AppConfig } from '../config'
import { encryptWithKey, decryptWithKey } from '../crypto'

/**
 * 用户自定义模型配置（文档 7.3.6 ModelConfig）
 * API Key 以 AES-256-GCM 加密存储，仅在调用模型时解密，不回传前端
 */
export class ModelConfigService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
  ) {}

  async list(userId: string): Promise<ModelConfigDto[]> {
    const configs = await this.prisma.modelConfig.findMany({
      where: { userId, deleted: false },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      include: { installedPlugin: { select: { name: true } } },
    })
    return configs.map((c) => ({
      id: c.id,
      installedPluginId: c.installedPluginId,
      installedPluginName: c.installedPlugin.name,
      name: c.name,
      baseUrl: c.baseUrl,
      apiKeyMasked: maskApiKey(this.decrypt(c.apiKeyEncrypted)),
      modelName: c.modelName,
      isDefault: c.isDefault,
      createdAt: c.createdAt.toISOString(),
    }))
  }

  async create(userId: string, req: CreateModelConfigRequest): Promise<ModelConfigDto> {
    if (!req.apiKey?.trim()) throw new BizError(ErrorCode.BAD_REQUEST, 'API Key 不能为空')
    const plugin = await this.prisma.installedPlugin.findFirst({
      where: { id: req.installedPluginId, userId, type: 'MODEL' },
    })
    if (!plugin) throw new BizError(ErrorCode.PLUGIN_NOT_FOUND, '模型插件不存在')

    // 设为默认时取消其他默认
    if (req.isDefault) {
      await this.prisma.modelConfig.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      })
    }
    const created = await this.prisma.modelConfig.create({
      data: {
        userId,
        installedPluginId: req.installedPluginId,
        name: req.name,
        baseUrl: req.baseUrl,
        apiKeyEncrypted: this.encrypt(req.apiKey.trim()),
        modelName: req.modelName,
        isDefault: req.isDefault ?? false,
      },
    })
    return this.toDto(created)
  }

  async update(userId: string, id: string, req: UpdateModelConfigRequest): Promise<ModelConfigDto> {
    const existing = await this.prisma.modelConfig.findFirst({ where: { id, userId, deleted: false } })
    if (!existing) throw new BizError(ErrorCode.NOT_FOUND, '模型配置不存在')

    if (req.isDefault) {
      await this.prisma.modelConfig.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      })
    }
    const updated = await this.prisma.modelConfig.update({
      where: { id },
      data: {
        name: req.name,
        baseUrl: req.baseUrl,
        modelName: req.modelName,
        isDefault: req.isDefault,
        apiKeyEncrypted: req.apiKey?.trim() ? this.encrypt(req.apiKey.trim()) : undefined,
      },
    })
    return this.toDto(updated)
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.modelConfig.findFirst({ where: { id, userId, deleted: false } })
    if (!existing) throw new BizError(ErrorCode.NOT_FOUND, '模型配置不存在')
    await this.prisma.modelConfig.update({ where: { id }, data: { deleted: true } })
  }

  /** 取解密后的完整配置（仅模型服务调用链使用，禁止输出到日志/前端） */
  async getDecrypted(userId: string, id: string): Promise<{
    id: string
    pluginId: string
    baseUrl: string | null
    apiKey: string
    modelName: string
  }> {
    const c = await this.prisma.modelConfig.findFirst({
      where: { id, userId, deleted: false },
      include: { installedPlugin: true },
    })
    if (!c) throw new BizError(ErrorCode.MODEL_CONFIG_INVALID, '模型配置不存在')
    return {
      id: c.id,
      pluginId: c.installedPlugin.pluginId,
      baseUrl: c.baseUrl,
      apiKey: this.decrypt(c.apiKeyEncrypted),
      modelName: c.modelName,
    }
  }

  private encrypt(plain: string): string {
    return encryptWithKey(this.config.apiCryptoKey, plain)
  }

  private decrypt(payload: string): string {
    try {
      return decryptWithKey(this.config.apiCryptoKey, payload)
    } catch {
      throw new BizError(ErrorCode.INTERNAL_ERROR, 'API Key 解密失败（密钥文件可能已更换）')
    }
  }

  private toDto(c: {
    id: string
    installedPluginId: string
    name: string
    baseUrl: string | null
    apiKeyEncrypted: string
    modelName: string
    isDefault: boolean
    createdAt: Date
  }): ModelConfigDto {
    return {
      id: c.id,
      installedPluginId: c.installedPluginId,
      installedPluginName: null,
      name: c.name,
      baseUrl: c.baseUrl,
      apiKeyMasked: maskApiKey(this.decrypt(c.apiKeyEncrypted)),
      modelName: c.modelName,
      isDefault: c.isDefault,
      createdAt: c.createdAt.toISOString(),
    }
  }
}
