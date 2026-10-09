import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { get, post } from '@/api/http'
import type { AuthResponse, UserDto, CreditLogDto, DailyClaimResult } from '@novelagent/shared'

const TOKEN_KEY = 'novelagent.token'

/** 登录态 store：JWT 持久化到 localStorage */
export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<UserDto | null>(null)

  const isLoggedIn = computed(() => !!token.value)

  function setAuth(payload: AuthResponse) {
    token.value = payload.token
    user.value = payload.user
    localStorage.setItem(TOKEN_KEY, payload.token)
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
  }

  async function fetchMe() {
    if (!token.value) return
    user.value = await get<UserDto>('/api/auth/me')
  }

  async function claimDaily(): Promise<DailyClaimResult> {
    const result = await post<DailyClaimResult>('/api/auth/daily-claim')
    if (user.value) user.value.credits = result.credits
    return result
  }

  async function loadCreditLogs(): Promise<CreditLogDto[]> {
    return get<CreditLogDto[]>('/api/credits/logs')
  }

  return { token, user, isLoggedIn, setAuth, logout, fetchMe, claimDaily, loadCreditLogs }
})
