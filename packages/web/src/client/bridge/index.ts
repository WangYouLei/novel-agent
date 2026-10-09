import { Context } from 'cordis'
import { io, type Socket } from 'socket.io-client'
import { BRIDGE_EVENTS, type GenerationProgressPayload } from '@novelagent/shared'

/**
 * 前端 Cordis Context + Bridge 插件（文档 4.7，ADR-005）
 * - 后端事件（插件事件/生成进度）→ 前端 ctx 事件总线（页面经 ctx.on 订阅）
 * - 前端服务调用 → 后端 Cordis 服务代理（remote-call）
 * - token 变化时重连（JWT 鉴权在握手阶段完成）
 */

let currentSocket: Socket | undefined

export interface Bridge {
  ctx: Context
  /** 远程调用后端 Cordis 服务（演示插件化调用链路） */
  call<T = unknown>(serviceId: string, method: string, ...args: unknown[]): Promise<T>
  /** 登录/登出后更新连接凭证 */
  setToken(token: string | null): void
  socket?: Socket
}

export function initBridge(): Bridge {
  const ctx = new Context()

  const bridge: Bridge = {
    ctx,
    setToken(token: string | null) {
      // 断开旧连接，带新 token 重连
      currentSocket?.disconnect()
      if (!token) return
      currentSocket = connect(ctx, token)
      bridge.socket = currentSocket
    },
    call(serviceId, method, ...args) {
      const socket = currentSocket
      if (!socket?.connected) {
        return Promise.reject(new Error('Bridge 未连接（请先登录）'))
      }
      return new Promise<T>((resolve, reject) => {
        const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        socket.emit(
          BRIDGE_EVENTS.SERVICE_CALL,
          { callId, serviceId, method, args },
          (result: { callId: string; ok: boolean; data?: T; error?: string }) => {
            if (result?.ok) resolve(result.data as T)
            else reject(new Error(result?.error ?? '远程调用失败'))
          },
        )
      })
    },
  }
  return bridge
}

function connect(ctx: Context, token: string): Socket {
  const socket = io('/plugin-bridge', {
    auth: { token },
    transports: ['websocket', 'polling'],
  })

  // 后端插件事件 → 前端事件总线（页面通过 ctx.on 订阅，类型见 events.d.ts）
  socket.on(BRIDGE_EVENTS.PLUGIN_EVENT, (name: string, payload: unknown) => {
    ctx.emit(name as never, payload as never)
  })

  // 生成进度 → 前端事件总线（大纲生成页进度条）
  socket.on(BRIDGE_EVENTS.GENERATION_PROGRESS, (payload: GenerationProgressPayload) => {
    ctx.emit('generation-progress', payload)
  })

  socket.on('connect', () => console.log('[bridge] 已连接插件桥'))
  socket.on('disconnect', (reason) => console.log('[bridge] 连接断开：', reason))
  socket.on('connect_error', (err) => console.warn('[bridge] 连接失败：', err.message))

  return socket
}
