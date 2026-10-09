/**
 * 对话式插件入口（Chat）：
 * 用户在对话框以自然语言 + 附件驱动插件，调度器决策执行哪个插件
 */

/** 消息附件摘要（完整文本仅随请求上行，不落库全文） */
export interface ChatAttachmentMeta {
  name: string
  chars: number
}

/** assistant 消息携带的插件调用记录（前端据此渲染结果卡片） */
export interface ChatToolCall {
  pluginId: string
  pluginName: string
  status: 'SUCCESS' | 'FAILED'
  /** 插件输入摘要 */
  input?: Record<string, unknown>
  /** 结果类型：outline = 大纲结构（可保存到小说）；stylePack = 已保存的风格包 */
  resultKind?: 'outline' | 'stylePack'
  /** resultKind=outline 时为完整 OutlineStructure */
  result?: unknown
  /** resultKind=stylePack 时的风格包 id */
  stylePackId?: string
  error?: string
}

export interface ChatMessageDto {
  id: string
  sessionId: string
  role: 'USER' | 'ASSISTANT'
  content: string
  attachments: ChatAttachmentMeta[] | null
  toolCall: ChatToolCall | null
  createdAt: string
}

export interface ChatSessionDto {
  id: string
  novelId: string | null
  novelTitle: string | null
  title: string
  createdAt: string
  updatedAt: string
}

export interface CreateChatSessionRequest {
  /** 关联小说（大纲等插件需要挂载到小说下） */
  novelId: string
}

export interface SendChatMessageRequest {
  content: string
  /** 附件（前端读取 .txt/.md 文本内容直接上行，服务端按上限截断） */
  attachment?: { name: string; text: string }
  /** 'builtin' = 内置模型（规则调度 + 执行计费）；其他 = 模型插件 id（LLM 调度） */
  providerId?: string
  /** providerId 非 builtin 时的模型配置 id */
  modelConfigId?: string
}

export interface SendChatMessageResponse {
  userMessage: ChatMessageDto
  assistantMessage: ChatMessageDto
}
