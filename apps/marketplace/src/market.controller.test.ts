import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'
import { MarketController } from './market.controller'

/**
 * publish 端点鉴权测试（批次 2，评审 H2）：
 * MARKET_PUBLISH_TOKEN 共享令牌、Bearer/裸 token 兼容、未配置环境变量时默认拒绝（fail-closed）
 */

const TOKEN = 'test-publish-token'

let originalToken: string | undefined

beforeEach(() => {
  originalToken = process.env.MARKET_PUBLISH_TOKEN
  process.env.MARKET_PUBLISH_TOKEN = TOKEN
})

afterEach(() => {
  if (originalToken === undefined) delete process.env.MARKET_PUBLISH_TOKEN
  else process.env.MARKET_PUBLISH_TOKEN = originalToken
})

/** 构造最小可用的上传文件对象（publish 只访问 buffer/length） */
function makeUploadFile(): Express.Multer.File {
  return { buffer: Buffer.from('fake-zip') } as Express.Multer.File
}

/** 构造注入了 stub registry 的控制器实例 */
function makeController(registry: { publish: ReturnType<typeof vi.fn> }): MarketController {
  return new MarketController(registry as unknown as ConstructorParameters<typeof MarketController>[0])
}

describe('validatePublishAuth token 校验', () => {
  it('无 Authorization 头 → 401', () => {
    expect(() => MarketController.validatePublishAuth(undefined)).toThrow(UnauthorizedException)
  })

  it('空 Authorization 头 → 401', () => {
    expect(() => MarketController.validatePublishAuth('')).toThrow(UnauthorizedException)
  })

  it('错误 token（Bearer 与裸值两种写法）→ 401', () => {
    expect(() => MarketController.validatePublishAuth('Bearer wrong-token')).toThrow(UnauthorizedException)
    expect(() => MarketController.validatePublishAuth('wrong-token')).toThrow(UnauthorizedException)
  })

  it('正确 Bearer token → 放行', () => {
    expect(() => MarketController.validatePublishAuth(`Bearer ${TOKEN}`)).not.toThrow()
  })

  it('正确裸 token 值（无 Bearer 前缀）→ 放行', () => {
    expect(() => MarketController.validatePublishAuth(TOKEN)).not.toThrow()
  })

  it('MARKET_PUBLISH_TOKEN 未配置 → 默认拒绝（fail-closed），错误信息提示如何配置', () => {
    delete process.env.MARKET_PUBLISH_TOKEN
    try {
      MarketController.validatePublishAuth(`Bearer ${TOKEN}`)
      expect.unreachable('未配置环境变量时应默认拒绝')
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException)
      expect((err as Error).message).toContain('MARKET_PUBLISH_TOKEN')
    }
  })
})

describe('publish 端点集成（鉴权先于业务执行）', () => {
  it('未带 token 的请求在触达 registry 前被 401 拒绝', () => {
    const registry = { publish: vi.fn() }
    const controller = makeController(registry)
    expect(() => controller.publish(makeUploadFile(), undefined, undefined)).toThrow(UnauthorizedException)
    expect(registry.publish).not.toHaveBeenCalled()
  })

  it('带错误 token 的请求被 401 拒绝，registry 不被调用', () => {
    const registry = { publish: vi.fn() }
    const controller = makeController(registry)
    expect(() => controller.publish(makeUploadFile(), '日志', 'Bearer wrong')).toThrow(UnauthorizedException)
    expect(registry.publish).not.toHaveBeenCalled()
  })

  it('携带正确 token 的请求转发 registry.publish', () => {
    const registry = { publish: vi.fn(() => ({ pluginId: 'ok' })) }
    const controller = makeController(registry)
    const file = makeUploadFile()
    const result = controller.publish(file, '更新日志', `Bearer ${TOKEN}`)
    expect(registry.publish).toHaveBeenCalledWith(file.buffer, '更新日志')
    expect(result).toEqual({ pluginId: 'ok' })
  })

  it('token 正确但缺少上传文件 → 400（鉴权之后的原有校验保持不变）', () => {
    const registry = { publish: vi.fn() }
    const controller = makeController(registry)
    expect(() => controller.publish(undefined, undefined, `Bearer ${TOKEN}`)).toThrow(/缺少上传文件/)
    expect(registry.publish).not.toHaveBeenCalled()
  })
})
