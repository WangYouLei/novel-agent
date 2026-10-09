import type { PrismaClient } from '@prisma/client'
import { excerpt, LIMITS } from '@novelagent/shared'

/**
 * 创作会话与模型调用记录（文档 7.3.7）
 * ModelCall 摘要化存储：输入/输出只存前 500 字 + token 统计（ADR-011）
 */
export class SessionService {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(params: {
    userId: string
    novelId?: string
    sessionType:
      | 'OUTLINE_GEN'
      | 'CHAPTER_WRITE'
      | 'POLISH'
      | 'CONTINUE'
      | 'STYLE_EXTRACT'
      | 'CHARACTER_GEN'
      | 'CUSTOM'
    featurePluginId?: string
    inputSummary?: string
  }): Promise<string> {
    const session = await this.prisma.writingSession.create({
      data: {
        userId: params.userId,
        novelId: params.novelId,
        sessionType: params.sessionType,
        featurePluginId: params.featurePluginId,
        inputSummary: params.inputSummary ? excerpt(params.inputSummary) : undefined,
      },
    })
    return session.id
  }

  async finishSession(sessionId: string, status: 'COMPLETED' | 'FAILED' | 'CANCELLED', outputSummary?: string) {
    await this.prisma.writingSession.update({
      where: { id: sessionId },
      data: {
        status,
        outputSummary: outputSummary ? excerpt(outputSummary) : undefined,
        endedAt: new Date(),
      },
    })
  }

  /** 记录一次模型调用（摘要化，ADR-011） */
  async recordModelCall(params: {
    sessionId: string
    userId: string
    modelProvider: string
    modelName: string
    input: string
    output: string
    inputTokens: number
    outputTokens: number
    creditCost: number
    status: 'SUCCESS' | 'FAILED' | 'STREAMING' | 'CANCELLED'
    errorMessage?: string
    durationMs: number
  }): Promise<string> {
    const call = await this.prisma.modelCall.create({
      data: {
        sessionId: params.sessionId,
        userId: params.userId,
        modelProvider: params.modelProvider,
        modelName: params.modelName,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        inputExcerpt: excerpt(params.input),
        outputExcerpt: excerpt(params.output),
        creditCost: params.creditCost,
        status: params.status,
        errorMessage: params.errorMessage,
        durationMs: params.durationMs,
      },
    })
    return call.id
  }

  /** 取会话最新一次模型调用的统计（生成接口返回用） */
  async getLatestModelCall(sessionId: string) {
    return this.prisma.modelCall.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    })
  }

  /** 清理超过保留期的调用记录（ADR-011：90 天；启动时执行一次） */
  async cleanupExpiredModelCalls(): Promise<number> {
    const cutoff = new Date(Date.now() - LIMITS.MODEL_CALL_RETENTION_DAYS * 24 * 3600 * 1000)
    const result = await this.prisma.modelCall.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })
    return result.count
  }
}
