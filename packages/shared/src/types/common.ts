/**
 * 统一 API 响应包装
 * 所有 REST 接口返回该结构，前端统一按 code 判断成败
 */
export interface ApiResponse<T = unknown> {
  /** 0 表示成功，非 0 见 ErrorCode */
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  items: T[]
  total: number
}
