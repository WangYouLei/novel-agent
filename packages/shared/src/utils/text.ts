import { LIMITS } from '../constants/limits'

/**
 * 文本摘要截断（ADR-011：模型调用日志只存前 500 字）
 */
export function excerpt(text: string, maxLen: number = LIMITS.EXCERPT_LENGTH): string {
  if (!text) return ''
  return text.length <= maxLen ? text : text.slice(0, maxLen)
}

/**
 * 粗略 token 估算（mock 统计用，非精确分词）
 * 经验值：中文约 1 字/token，英文约 4 字符/token，取加权平均
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const otherLen = text.length - cjkCount
  return Math.max(1, Math.round(cjkCount + otherLen / 4))
}

/** 掩码 API Key：sk-1234567890abcdef → sk-****cdef */
export function maskApiKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return `${key.slice(0, 3)}****${key.slice(-4)}`
}
