import { Logger } from '@nestjs/common'
import {
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import type { Server, Socket } from 'socket.io'
import { AuthService } from '@novelagent/application'
import { BRIDGE_EVENTS, type GenerationProgressPayload } from '@novelagent/shared'
import { CordisHost } from '../cordis.host'

/** 前端服务调用请求（Bridge 插件发出，文档 4.7） */
interface ServiceCallPayload {
  callId: string
  serviceId: string
  method: string
  args: unknown[]
}

/**
 * 前后端 Bridge 网关（文档 2.2 / 4.7，ADR-005）：
 * - WebSocket 双向桥接两个 Cordis Context
 * - 上行：前端 'service-call' → 后端 Cordis 服务代理调用
 * - 下行：Cordis 事件（大纲完成/插件状态变化）转发给前端
 * - 生成进度推送（generation-progress）
 *
 * MVP 最小实现（文档 ADR-005：服务调用代理 + 事件转发，不追求完美）
 */
@WebSocketGateway({ namespace: '/plugin-bridge', cors: { origin: '*' } })
export class BridgeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server
  private readonly logger = new Logger('BridgeGateway')

  constructor(
    private readonly authService: AuthService,
    private readonly cordisHost: CordisHost,
  ) {}

  afterInit(): void {
    // 订阅 Cordis 事件 → 转发前端（按用户房间定向）
    this.cordisHost.root.on('outline-generated', (data) => {
      this.server?.to(this.userRoom(data.userId)).emit(BRIDGE_EVENTS.PLUGIN_EVENT, 'outline-generated', {
        novelId: data.novelId,
        pluginId: data.pluginId,
      })
    })
    this.cordisHost.root.on('plugin-status-changed', (data) => {
      this.server?.emit(BRIDGE_EVENTS.PLUGIN_EVENT, 'plugin-status-changed', data)
    })
    this.logger.log('Bridge 网关就绪（/plugin-bridge）')
  }

  /** 连接握手：JWT 校验（auth.token），通过后加入用户房间 */
  handleConnection(client: Socket): void {
    const token = (client.handshake.auth?.token as string) ?? ''
    try {
      const userId = this.authService.verifyToken(token)
      client.data.userId = userId
      client.join(this.userRoom(userId))
      this.logger.log(`Bridge 客户端已连接：${client.id}（用户 ${userId}）`)
    } catch (err) {
      this.logger.warn(`Bridge 连接被拒绝：${(err as Error).message}`)
      client.disconnect(true)
    }
  }

  /** 前端 → 后端：Cordis 服务代理调用（前端 Bridge 插件的 remote-call 通道） */
  @SubscribeMessage(BRIDGE_EVENTS.SERVICE_CALL)
  async onServiceCall(client: Socket, payload: ServiceCallPayload): Promise<unknown> {
    const started = Date.now()
    try {
      const service = this.cordisHost.get<Record<string, unknown>>(payload.serviceId)
      if (!service || typeof service[payload.method] !== 'function') {
        return {
          callId: payload.callId,
          ok: false,
          error: `服务 ${payload.serviceId}.${payload.method} 不可用（插件未启用）`,
        }
      }
      const result = await (service[payload.method] as (...args: unknown[]) => unknown)(
        ...payload.args,
      )
      this.logger.log(
        `service-call ${payload.serviceId}.${payload.method} 耗时 ${Date.now() - started}ms`,
      )
      return { callId: payload.callId, ok: true, data: result }
    } catch (err) {
      this.logger.warn(
        `service-call ${payload.serviceId}.${payload.method} 失败：${(err as Error).message}`,
      )
      return { callId: payload.callId, ok: false, error: (err as Error).message }
    }
  }

  /** 生成进度推送（WritingController 的 emitProgress 回调） */
  pushProgress(userId: string, payload: GenerationProgressPayload): void {
    this.server?.to(this.userRoom(userId)).emit(BRIDGE_EVENTS.GENERATION_PROGRESS, payload)
  }

  private userRoom(userId: string): string {
    return `user:${userId}`
  }
}
