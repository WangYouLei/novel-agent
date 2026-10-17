import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import type { Socket } from 'socket.io'
import type { AuthService } from '@novelagent/application'
import { BRIDGE_CALL_WHITELIST, BridgeGateway } from './bridge.gateway'
import type { CordisHost } from '../cordis.host'

/**
 * Bridge 服务调用白名单测试（批次 2，评审 H5）：
 * 默认拒绝（空白名单起步）、白名单命中放行、拒绝不触达 Cordis 服务
 */

/** 构造 mock CordisHost：get 交由用例控制 */
function makeGateway(get: () => unknown): BridgeGateway {
  const host = { get } as unknown as CordisHost
  return new BridgeGateway({} as AuthService, host)
}

const dummyClient = {} as Socket

function call(gateway: BridgeGateway, serviceId: string, method: string, callId = 'c1') {
  return gateway.onServiceCall(dummyClient, { callId, serviceId, method, args: [] })
}

/** 白名单是模块级常量，测试内临时放行后须移除，避免污染其他用例 */
function allowTemporarily(key: string): () => void {
  ;(BRIDGE_CALL_WHITELIST as string[]).push(key)
  return () => {
    const i = BRIDGE_CALL_WHITELIST.indexOf(key)
    if (i >= 0) (BRIDGE_CALL_WHITELIST as string[]).splice(i, 1)
  }
}

describe('BridgeGateway.onServiceCall 默认拒绝（评审 H5）', () => {
  it('白名单初始为空清单（默认拒绝）', () => {
    expect(BRIDGE_CALL_WHITELIST).toEqual([])
  })

  it('未放行的 serviceId.method 被拒绝：返回明确错误且不触达 Cordis 服务', async () => {
    const get = vi.fn()
    const gateway = makeGateway(get)
    const result = (await call(gateway, 'outline-generator', 'generate')) as {
      callId: string
      ok: boolean
      error: string
    }
    expect(result.callId).toBe('c1')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('bridge 调用未放行')
    // 拒绝发生在触达 Cordis 服务之前（默认拒绝不暴露任何服务面）
    expect(get).not.toHaveBeenCalled()
  })

  it('错误信息包含被拒的 key 与白名单配置指引', async () => {
    const gateway = makeGateway(vi.fn())
    const result = (await call(gateway, 'evil-service', 'stealData')) as { error: string }
    expect(result.error).toContain('evil-service.stealData')
    expect(result.error).toContain('白名单')
  })

  it('白名单显式放行后，调用经既有分发结构转发 Cordis 服务', async () => {
    const restore = allowTemporarily('demo-service.ping')
    try {
      const get = vi.fn(() => ({ ping: () => 'pong' }))
      const gateway = makeGateway(get)
      const result = await call(gateway, 'demo-service', 'ping', 'c2')
      expect(result).toEqual({ callId: 'c2', ok: true, data: 'pong' })
      expect(get).toHaveBeenCalledWith('demo-service')
    } finally {
      restore()
    }
  })

  it('同一服务白名单外的其他方法仍被拒绝（key 粒度为 serviceId.method）', async () => {
    const restore = allowTemporarily('demo-service.ping')
    try {
      const get = vi.fn(() => ({ ping: () => 'pong' }))
      const gateway = makeGateway(get)
      const result = (await call(gateway, 'demo-service', 'evil')) as { ok: boolean; error: string }
      expect(result.ok).toBe(false)
      expect(result.error).toContain('bridge 调用未放行')
      expect(get).not.toHaveBeenCalled()
    } finally {
      restore()
    }
  })

  it('白名单放行但服务不可用时，既有"服务不可用"错误通道保持不变', async () => {
    const restore = allowTemporarily('demo-service.missing')
    try {
      const gateway = makeGateway(() => undefined)
      const result = (await call(gateway, 'demo-service', 'missing')) as { ok: boolean; error: string }
      expect(result.ok).toBe(false)
      expect(result.error).toContain('不可用')
    } finally {
      restore()
    }
  })
})
