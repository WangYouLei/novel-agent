import type { StylePackContent } from '@novelagent/shared'

/**
 * 内置 mock 模型的本地风格分析
 * 纯本地实现（不调任何外部 API）：从提示词中还原小说原文，
 * 用统计方法（分句/词频/标点特征）提取风格包，保证内置免费模型也能完整体验
 * 上传小说 → 风格包链路（与真实模型插件的输出结构一致）
 */

/** 从风格分析提示词中提取元信息与原文（插件在 prompt 中嵌入的结构化标记块） */
export function generateMockStylePack(prompt: string): StylePackContent {
  const sampleMatch = prompt.match(/\[SAMPLES:(\d+)\]/)
  const sampleCount = sampleMatch ? Number(sampleMatch[1]) : 5
  const vocabMatch = prompt.match(/\[VOCABS:(\d+)\]/)
  const vocabCount = vocabMatch ? Number(vocabMatch[1]) : 10
  // 原文位于首个"小说文本："标记之后
  const idx = prompt.indexOf('小说文本：')
  const sourceText = idx >= 0 ? prompt.slice(idx + '小说文本：'.length).trim() : ''
  return analyzeStyleText(sourceText, sampleCount, vocabCount)
}

/** 统计式风格提取：分句取样、高频词、句式与标点特征 */
export function analyzeStyleText(
  sourceText: string,
  sampleCount: number,
  vocabCount: number,
): StylePackContent {
  const sentences = splitSentences(sourceText)

  // 1. 示例句：长度适中（10-100 字）的完整句，均匀取样并保留句末标点
  const candidates = sentences.filter((s) => s.text.length >= 10 && s.text.length <= 100)
  const sampleSentences: string[] = []
  if (candidates.length > 0) {
    const take = Math.min(sampleCount, candidates.length)
    for (let i = 0; i < take; i++) {
      const pos = Math.floor((i * candidates.length) / take)
      sampleSentences.push(candidates[pos].text)
    }
  }

  // 2. 高频风格词：2-4 字纯中文 n-gram，滤虚词字、去包含重复
  const vocabPreferences = extractTopWords(sourceText, vocabCount)

  // 3. 文本特征：平均句长 / 对白占比 / 感叹问句频率
  const avgLen =
    sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.text.length, 0) / sentences.length
      : 0
  const dialogRatio =
    sentences.length > 0
      ? sentences.filter((s) => s.text.includes('“') || s.text.includes('「')).length / sentences.length
      : 0
  const emotionalRatio =
    sentences.length > 0
      ? sentences.filter((s) => /[！？!?]/.test(s.punct)).length / sentences.length
      : 0

  const rhythm =
    avgLen === 0 ? '句式信息不足' : avgLen < 18 ? '短句为主，节奏明快' : avgLen <= 35 ? '长短句相间，张弛有度' : '长句绵密，叙述细腻'
  const narrative =
    dialogRatio > 0.3
      ? '以对白驱动叙事，人物声口鲜活'
      : dialogRatio < 0.05
        ? '以叙述与描写为主，笔致沉静'
        : '叙述与对白交织，场景感强'
  const tone =
    emotionalRatio > 0.05 ? '情绪表达外放，感染力强' : emotionalRatio < 0.01 ? '笔调克制冷静，情感内敛' : '情感浓淡相宜'

  const vocabPreview = vocabPreferences.slice(0, 2)

  const styleSummary = `提取自上传小说：${rhythm}，${narrative}，${tone}${
    vocabPreview.length > 0 ? `；标志性词汇如「${vocabPreview.join('」「')}」` : ''
  }`

  const promptGuidance = `模仿该文风写作：句式上${rhythm}；叙事上${narrative}，${tone}；行文自然融入标志性词汇${
    vocabPreferences.length > 0 ? `（${vocabPreferences.slice(0, 6).join('、')}）` : ''
  }，保持原文的语感、意象与用词习惯。`

  return { styleSummary, promptGuidance, vocabPreferences, sampleSentences }
}

/** 分句：保留原句文本与句末标点 */
function splitSentences(text: string): Array<{ text: string; punct: string }> {
  const result: Array<{ text: string; punct: string }> = []
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.match(/[^。！？!?…；]+[。！？!?…；]?/g) ?? []
    for (const part of parts) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const punct = trimmed.slice(-1)
      result.push({ text: trimmed, punct: /[。！？!?…；]/.test(punct) ? punct : '' })
    }
  }
  return result
}

/** 常见虚词字：出现在 n-gram 中即视为无风格辨识度 */
const STOP_CHARS = new Set('的了着和是在他她它有这个们也都不就来说要去会能被把与及或等呢吧啊嘛么之其而又但却因为所以如果虽然'.split(''))

/** n-gram 词频统计提取标志性词汇（按频次降序，跳过与已选词有包含关系的候选） */
function extractTopWords(text: string, limit: number): string[] {
  const freq = new Map<string, number>()
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= text.length; i++) {
      const gram = text.slice(i, i + n)
      if (!/^[\u4e00-\u9fa5]+$/.test(gram)) continue
      if ([...gram].some((c) => STOP_CHARS.has(c))) continue
      freq.set(gram, (freq.get(gram) ?? 0) + 1)
    }
  }

  const sorted = [...freq.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)

  const picked: string[] = []
  for (const [word] of sorted) {
    if (picked.length >= limit) break
    if (picked.some((p) => p.includes(word) || word.includes(p))) continue
    picked.push(word)
  }
  return picked
}
