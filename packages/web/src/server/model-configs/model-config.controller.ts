import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { ModelConfigService, PluginRegistryService } from '@novelagent/application'
import type {
  BuiltinModelDto,
  CreateModelConfigRequest,
  ModelConfigDto,
  UpdateModelConfigRequest,
} from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { CordisHost } from '../cordis.host'

/**
 * 模型配置控制器（PRD：自定义模型配置 + 模型选择）
 * 另提供可用模型列表（内置免费 + 用户自定义），供创作页选择模型
 */
@Controller('api/models')
@UseGuards(JwtGuard)
export class ModelConfigController {
  constructor(
    private readonly modelConfigService: ModelConfigService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly cordisHost: CordisHost,
  ) {}

  /** 可用模型列表：内置免费模型（消耗积分）+ 用户自定义模型配置 */
  @Get('available')
  async available(@CurrentUser() userId: string): Promise<{
    builtin: BuiltinModelDto
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
      custom,
    }
  }

  @Get('configs')
  async list(@CurrentUser() userId: string): Promise<ModelConfigDto[]> {
    return this.modelConfigService.list(userId)
  }

  @Post('configs')
  async create(
    @CurrentUser() userId: string,
    @Body() body: CreateModelConfigRequest,
  ): Promise<ModelConfigDto> {
    return this.modelConfigService.create(userId, body)
  }

  @Put('configs/:id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: UpdateModelConfigRequest,
  ): Promise<ModelConfigDto> {
    return this.modelConfigService.update(userId, id, body)
  }

  @Delete('configs/:id')
  async remove(@CurrentUser() userId: string, @Param('id') id: string): Promise<void> {
    await this.modelConfigService.remove(userId, id)
  }
}
