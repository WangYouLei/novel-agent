import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { SYSTEM_MODEL_PROVIDERS } from '@novelagent/shared'
import { ModelConfigService } from '@novelagent/application'
import type {
  BuiltinModelDto,
  CreateModelConfigRequest,
  ModelConfigDto,
  SystemModelProviderDto,
  UpdateModelConfigRequest,
} from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'

/**
 * 模型配置控制器（PRD：自定义模型配置 + 模型选择）
 * 另提供可用模型列表（内置免费 + 系统厂商预设 + 用户自定义），供创作页选择模型
 */
@Controller('api/models')
@UseGuards(JwtGuard)
export class ModelConfigController {
  constructor(private readonly modelConfigService: ModelConfigService) {}

  /** 可用模型列表：系统厂商预设 + 内置免费模型 + 用户自定义模型配置 */
  @Get('available')
  async available(@CurrentUser() userId: string): Promise<{
    builtin: BuiltinModelDto
    providers: SystemModelProviderDto[]
    custom: ModelConfigDto[]
  }> {
    const custom = await this.modelConfigService.list(userId)
    return {
      builtin: {
        providerId: 'builtin',
        modelId: 'mock-v1',
        displayName: '内置免费模型（消耗积分）',
        billingType: 'CREDIT',
      },
      providers: SYSTEM_MODEL_PROVIDERS,
      custom,
    }
  }

  @Get('configs')
  async list(@CurrentUser() userId: string): Promise<ModelConfigDto[]> {
    return await this.modelConfigService.list(userId)
  }

  @Post('configs')
  async create(
    @CurrentUser() userId: string,
    @Body() body: CreateModelConfigRequest,
  ): Promise<ModelConfigDto> {
    return await this.modelConfigService.create(userId, body)
  }

  @Put('configs/:id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: UpdateModelConfigRequest,
  ): Promise<ModelConfigDto> {
    return await this.modelConfigService.update(userId, id, body)
  }

  @Delete('configs/:id')
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.modelConfigService.remove(userId, id)
  }
}
