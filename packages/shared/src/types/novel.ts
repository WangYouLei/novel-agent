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
