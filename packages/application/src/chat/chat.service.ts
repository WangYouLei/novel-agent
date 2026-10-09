import type { PrismaClient } from '@prisma/client'
import { BizError, ErrorCode, LIMITS, type ChatToolCall } from '@novelagent/shared'

/**
 * 对话会话/消息领域服务（对话式插件入口）
 * 附件只存摘要 [{ name, chars }]，全文不落库
 */
export class ChatService {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(userId: string, novelId?: string) {
    return this.prisma.chatSession.create({
      data: { userId, novelId: novelId ?? null },
      include: { novel: true },
    })
  }

  listSessions(userId: string) {
    return this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: { novel: true },
    })
  }

  /** 校验会话归属并返回（含关联小说） */
  async getSession(userId: string, sessionId: string) {
    const session = await this.prisma.chatSession.findFirst({
      where: { id: sessionId, userId },
      include: { novel: true },
    })
    if (!session) throw new BizError(ErrorCode.NOT_FOUND, '对话不存在')
    return session
  }

  async listMessages(userId: string, sessionId: string) {
    await this.getSession(userId, sessionId)
    return this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** 近期消息（调度上下文用，含截断） */
  async recentMessages(userId: string, sessionId: string, take = LIMITS.CHAT_CONTEXT_MESSAGES) {
    await this.getSession(userId, sessionId)
    const messages = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take,
    })
    return messages.reverse()
  }

  async appendMessage(params: {
    sessionId: string
    role: 'USER' | 'ASSISTANT'
    content: string
    attachments?: { name: string; chars: number }[]
    toolCall?: ChatToolCall
  }) {
    const message = await this.prisma.chatMessage.create({
      data: {
        sessionId: params.sessionId,
        role: params.role,
        content: params.content,
        attachments: params.attachments?.length ? (params.attachments as never) : undefined,
        toolCall: params.toolCall ? (params.toolCall as never) : undefined,
      },
    })
    // 首条用户消息截断为会话标题
    if (params.role === 'USER') {
      await this.prisma.chatSession.updateMany({
        where: { id: params.sessionId, title: '新对话' },
        data: { title: excerptTitle(params.content) },
      })
    }
    return message
  }
}

function excerptTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length > LIMITS.CHAT_TITLE_MAX_LENGTH
    ? `${t.slice(0, LIMITS.CHAT_TITLE_MAX_LENGTH)}…`
    : t
}
