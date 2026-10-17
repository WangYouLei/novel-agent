import type { ApiResponse } from '@novelagent/shared'
import { useAuthStore } from '@/stores/auth'

/** 统一 API 错误（后端 ApiResponse.code 非 0 时抛出） */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

/** fetch 封装：自动带 JWT、统一解析 ApiResponse、401 跳登录 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = useAuthStore()
  // FormData 上传不设 Content-Type（由浏览器携带 multipart boundary）
  const isForm = init.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers as Record<string, string>),
  }
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`

  let res: Response
  try {
    // 前端 HTTP 统一 30s 超时（全链路超时治理，评审 M8/L7）
    res = await fetch(path, { ...init, headers, signal: AbortSignal.timeout(30_000) })
  } catch (err) {
    // 超时抛出 name 为 TimeoutError 的 DOMException，转译为用户可读信息；其余网络错误原样抛出
    if ((err as Error).name === 'TimeoutError' || (err as Error).name === 'AbortError') {
      throw new Error('请求超时（30 秒），请检查网络后重试')
    }
    throw err
  }
  const body = (await res.json().catch(() => ({ code: -1, message: '响应解析失败' }))) as ApiResponse<T>

  if (body.code === 401) {
    auth.logout()
    window.location.href = '/#/login'
    throw new ApiError(401, body.message)
  }
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message)
  }
  return body.data
}

export const get = <T>(path: string) => request<T>(path)
export const post = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined })
export const put = <T>(path: string, data?: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(data) })
export const del = <T>(path: string) => request<T>(path, { method: 'DELETE' })
/** multipart 表单上传（如本地插件 zip 安装） */
export const postForm = <T>(path: string, form: FormData) =>
  request<T>(path, { method: 'POST', body: form })
