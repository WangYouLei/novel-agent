/**
 * 全局错误码约定（文档待确认项"错误码约定"的落地实现）
 * 0        成功
 * 4xx      通用 HTTP 语义错误
 * 1xxx     账户/积分类业务错误
 * 2xxx     插件/模型/创作类业务错误
 */
export const ErrorCode = {
  OK: 0,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,

  // ---- 账户与积分 1xxx ----
  USERNAME_TAKEN: 1001,
  INVALID_CREDENTIALS: 1002,
  INSUFFICIENT_CREDITS: 1003,
  DAILY_ALREADY_CLAIMED: 1004,

  // ---- 插件与创作 2xxx ----
  PLUGIN_NOT_FOUND: 2001,
  PLUGIN_NOT_ENABLED: 2002,
  /** 依赖缺失（如：缺少模型提供者），对应 PRD 6.3 验收标准 5 */
  DEPENDENCY_MISSING: 2003,
  MODEL_PROVIDER_MISSING: 2004,
  MODEL_CONFIG_INVALID: 2005,
  GENERATION_FAILED: 2006,
  /** 超过单次批量生成上限（PRD 4.3） */
  GENERATION_LIMIT_EXCEEDED: 2007,
  STYLE_PACK_NOT_FOUND: 2008,
  /** 对话调度/执行失败 */
  CHAT_FAILED: 2009,
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

/** 业务错误：携带错误码的 Error 子类，Nest 全局过滤器统一转译为 ApiResponse */
export class BizError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'BizError'
  }
}
