import { IsNotEmpty, IsOptional, IsString } from 'class-validator'
import type { CreateNovelRequest } from '@novelagent/shared'

/** 小说创建请求 DTO（校验由 BodyDtoPipe 显式执行，见 dto.pipe.ts） */
export class CreateNovelRequestDto implements CreateNovelRequest {
  @IsString()
  @IsNotEmpty()
  title: string

  @IsOptional()
  @IsString()
  description?: string

  @IsOptional()
  @IsString()
  genre?: string

  @IsOptional()
  @IsString()
  stylePackId?: string
}
