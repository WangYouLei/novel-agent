export type StylePackSourceType = 'BUILTIN' | 'USER_GENERATED' | 'THIRD_PARTY'

/**
 * 风格包内容结构（文档待确认项"风格包 content schema"的落地实现）
 * - styleSummary：风格一句话说明（UI 展示）
 * - promptGuidance：注入模型提示词的风格指令
 * - vocabPreferences：词汇偏好（喂给模型 + mock 模型选词用）
 * - sampleSentences：风格示例句（辅助模型对齐语感）
 */
export interface StylePackContent {
  styleSummary: string
  promptGuidance: string
  vocabPreferences: string[]
  sampleSentences: string[]
}

export interface StylePackDto {
  id: string
  builtinKey: string | null
  name: string
  description: string | null
  sourceType: StylePackSourceType
  version: string
  modifiable: boolean
  content: StylePackContent
  forkedFromId: string | null
  createdAt: string
}

export interface UpdateStylePackRequest {
  name?: string
  description?: string
  /** 内置风格包只读，只允许复制后修改（PRD 3.3） */
  content?: StylePackContent
}

/** 上传小说生成风格包请求（style-generator 插件链路） */
export interface GenerateStylePackRequest {
  /** 风格包名称（留空则自动命名） */
  name?: string
  /** 上传的小说文本（服务端按 LIMITS.STYLE_SOURCE_MAX_LENGTH 校验，插件按配置截断送模型） */
  sourceText: string
  /** 'builtin' = 内置免费模型（消耗积分）；其他 = 模型插件 id（用户自己的 Key） */
  providerId: string
  /** providerId 为模型插件时，用户模型配置 id */
  modelConfigId?: string
  /** 用户在 UI 上临时覆盖的插件参数（不改持久化配置） */
  pluginConfig?: Record<string, unknown>
}
