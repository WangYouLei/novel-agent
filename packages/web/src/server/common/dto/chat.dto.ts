import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { LIMITS, type SendChatMessageRequest } from '@novelagent/shared'

/**
 * 对话发送消息请求 DTO（校验由 BodyDtoPipe 显式执行，见 dto.pipe.ts）
 * attachment 为嵌套结构，不在此校验（长度限制由 controller 截断处理）
 */
export class SendChatMessageRequestDto implements SendChatMessageRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.CHAT_MESSAGE_MAX_LENGTH)
  content: string

  attachment?: { name: string; text: string }

  @IsOptional()
  @IsString()
  pluginId?: string

  @IsOptional()
  @IsString()
  providerId?: string

  @IsOptional()
  @IsString()
  modelConfigId?: string

  /** 系统模型直连时的模型名（providerId 为厂商预设且无 modelConfigId） */
  @IsOptional()
  @IsString()
  modelName?: string
}
