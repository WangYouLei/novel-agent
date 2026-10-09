/** 用户信息（脱敏后返回前端） */
export interface UserDto {
  id: string
  username: string
  role: string
  credits: number
  vipExpiresAt: string | null
  createdAt: string
}

export interface RegisterRequest {
  username: string
  password: string
}

export interface LoginRequest {
  username: string
  password: string}

export interface AuthResponse {
  token: string
  user: UserDto
}

export interface DailyClaimResult {
  /** 本次领取数额 */
  claimed: number
  /** 领取后余额 */
  credits: number
}

export interface CreditLogDto {
  id: string
  amount: number
  type: string
  description: string | null
  createdAt: string
}
