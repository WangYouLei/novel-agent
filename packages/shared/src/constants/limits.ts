/**
 * 业务限制常量（均为服务端可调参数，避免写死 —— PRD 4.3）
 */
export const LIMITS = {
  /** 单次批量生成任务的章节上限（PRD 4.3：默认 10 章） */
  MAX_CHAPTERS_PER_GENERATION: 10,
  /** 模型调用日志摘要长度（ADR-011：输入/输出各 500 字） */
  EXCERPT_LENGTH: 500,
  /** 模型调用日志保留天数（ADR-011：90 天） */
  MODEL_CALL_RETENTION_DAYS: 90,
  /** 用户名长度限制 */
  USERNAME_MIN: 2,
  USERNAME_MAX: 32,
  /** 密码长度限制 */
  PASSWORD_MIN: 6,
  /** 创意描述最大长度 */
  IDEA_MAX_LENGTH: 2000,
  /** 上传小说生成风格包：单次文本最大长度（送模型前插件还会按配置截断） */
  STYLE_SOURCE_MAX_LENGTH: 200000,
  /** 对话：单条消息最大长度 */
  CHAT_MESSAGE_MAX_LENGTH: 4000,
  /** 对话：附件文本最大长度（超出截断，全文不落库） */
  CHAT_ATTACHMENT_MAX_CHARS: 50000,
  /** 对话：调度上下文携带的近期消息条数 */
  CHAT_CONTEXT_MESSAGES: 12,
  /** 对话：会话标题长度（取首条消息截断） */
  CHAT_TITLE_MAX_LENGTH: 24,
} as const

/**
 * mock 积分定价（PRD 第 7 节"积分定价策略"未定，此处为可配置默认值）
 */
export const CREDIT_POLICY = {
  /** 注册赠送积分 */
  REGISTER_BONUS: 200,
  /** 每日可领取积分 */
  DAILY_CLAIM_AMOUNT: 100,
  /** 大纲生成一次消耗积分（内置模型） */
  OUTLINE_GENERATION_COST: 10,
} as const
