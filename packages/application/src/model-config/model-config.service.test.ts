import { describe, it, expect } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import type { AppConfig } from '../config'
import { ModelConfigService } from './model-config.service'
import { encryptWithKey } from '../crypto'

/**
 * list 解密容错测试（批次 4.3）：
 * 纯 mock（PrismaClient 最小形状 + 真实 AES-256-GCM 加解密），不依赖数据库测试基建
 */

/** 测试用固定密钥（32 字节） */
const key = Buffer.alloc(32, 7)

/** 构造 findMany 返回形状的记录 */
function makeRecord(id: string, apiKeyEncrypted: string) {
  return {
    id,
    installedPluginId: 'plug-1',
    installedPlugin: { name: 'OpenAI 兼容' },
    name: `配置 ${id}`,
    baseUrl: 'https://api.example.com/v1',
    apiKeyEncrypted,
    modelName: 'gpt-test',
    isDefault: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function makeService(records: unknown[]): ModelConfigService {
  const prisma = { modelConfig: { findMany: async () => records } } as unknown as PrismaClient
  const config = { apiCryptoKey: key } as unknown as AppConfig
  return new ModelConfigService(prisma, config)
}

describe('ModelConfigService.list 解密容错', () => {
  it('全部可解密时正常返回掩码', async () => {
    const service = makeService([makeRecord('g1', encryptWithKey(key, 'sk-good-key-123456'))])
    const list = await service.list('u1')
    expect(list).toHaveLength(1)
    expect(list[0].apiKeyMasked).toBe('sk-****3456')
    expect(list[0].name).toBe('配置 g1')
  })

  it('单条解密失败不拖垮整页：坏记录掩码为固定文案，其余字段正常返回', async () => {
    const service = makeService([
      makeRecord('g1', encryptWithKey(key, 'sk-good-key-123456')),
      makeRecord('b1', 'garbled-not-a-cipher'),
    ])
    const list = await service.list('u1')
    expect(list).toHaveLength(2)
    expect(list[0].apiKeyMasked).toBe('sk-****3456')
    expect(list[1].apiKeyMasked).toBe('****（解密失败）')
    expect(list[1].name).toBe('配置 b1')
    expect(list[1].baseUrl).toBe('https://api.example.com/v1')
    expect(list[1].modelName).toBe('gpt-test')
  })

  it('密文格式合法但密钥不匹配（密钥文件更换后遗留数据）同样容错', async () => {
    const otherKey = Buffer.alloc(32, 9)
    const service = makeService([makeRecord('b2', encryptWithKey(otherKey, 'sk-orphan'))])
    const list = await service.list('u1')
    expect(list).toHaveLength(1)
    expect(list[0].apiKeyMasked).toBe('****（解密失败）')
  })
})
