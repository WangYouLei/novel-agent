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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  }
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`

  const res = await fetch(path, { ...init, headers })
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
