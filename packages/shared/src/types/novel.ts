export type NovelStatus = 'DRAFT' | 'ONGOING' | 'COMPLETED' | 'ARCHIVED'

export interface NovelDto {
  id: string
  title: string
  description: string | null
  genre: string | null
  status: NovelStatus
  stylePackId: string | null
  /** 关联风格包名称（列表展示用，可能为 null 表示未选择） */
  stylePackName: string | null
  wordCount: number
  createdAt: string
  updatedAt: string
}

export interface CreateNovelRequest {
  title: string
  description?: string
  genre?: string
  stylePackId?: string
}

export interface UpdateNovelRequest {
  title?: string
  description?: string
  genre?: string
  stylePackId?: string | null
  status?: NovelStatus
}

export type ChapterStatus = 'DRAFT' | 'OUTLINED' | 'WRITING' | 'REVIEWING' | 'PUBLISHED'

export interface ChapterDto {
  id: string
  novelId: string
  /** 展示序号（按 sortOrder 排序后动态生成，从 1 开始） */
  no: number
  title: string
  summary: string | null
  content: string | null
  wordCount: number
  status: ChapterStatus
  createdAt: string
  updatedAt: string
}

export interface CreateChapterRequest {
  title: string
  summary?: string
  content?: string
}

export interface UpdateChapterRequest {
  title?: string
  summary?: string | null
  content?: string | null
  status?: ChapterStatus
}
