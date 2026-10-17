/**
 * 风格包 content 结构校验（评审 M11/L1：入库前拦截畸形数据）
 * 只强制下游创作链路依赖的两个字段；其余字段（styleSummary、sampleSentences 等）
 * 不校验，由调用方原样保留
 */

/**
 * 校验风格包 content 的核心结构
 * @returns 错误信息列表（空数组 = 校验通过）
 */
export function validateStylePackContent(content: unknown): string[] {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    return ['content 必须是对象']
  }
  const { promptGuidance, vocabPreferences } = content as Record<string, unknown>
  const errors: string[] = []
  if (typeof promptGuidance !== 'string') {
    errors.push('promptGuidance 必须是字符串')
  }
  if (!Array.isArray(vocabPreferences) || vocabPreferences.some((v) => typeof v !== 'string')) {
    errors.push('vocabPreferences 必须是字符串数组')
  }
  return errors
}
