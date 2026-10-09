/** 大纲结构（存储于 Outline.structure JSON，ADR-007：JSON 树整体读写） */
export interface OutlineChapter {
  no: number
  title: string
  summary: string
  /** 关键事件/伏笔（插件可选产出） */
  keyEvents?: string[]
}

export interface OutlineStructure {
  /** 作品名（插件依据创意产出） */
  title: string
  /** 一句话故事（logline） */
  logline: string
  /** 主题 */
  theme: string
  chapters: OutlineChapter[]
}

export interface OutlineDto {
  id: string
  novelId: string
  version: number
  isActive: boolean
  structure: OutlineStructure
  generatedBy: string | null
  createdAt: string
}

export interface SaveOutlineRequest {
  /** writing session 中生成的大纲内容 */
  structure: OutlineStructure
}
