import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import {
  AuthService,
  PluginRegistryService,
  type PluginManifest,
} from '@novelagent/application'
import type { AuthResponse, DailyClaimResult, RegisterRequest, LoginRequest, UserDto } from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'
import { CordisHost } from '../cordis.host'

/**
 * 认证控制器：注册 / 登录（JWT）/ 当前用户 / 每日积分领取
 * 注册与登录成功后为用户 seed 内置插件记录（文档 7.3.6 策略）
 */
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly cordisHost: CordisHost,
  ) {}

  @Post('register')
  async register(@Body() body: RegisterRequest): Promise<AuthResponse> {
    const user = await this.authService.register(body.username, body.password)
    await this.seedPlugins(user.id)
    const token = this.authService.signToken(user.id)
    return { token, user }
  }

  @Post('login')
  async login(@Body() body: LoginRequest): Promise<AuthResponse> {
    const { user } = await this.authService.login(body.username, body.password)
    await this.seedPlugins(user.id)
    const token = this.authService.signToken(user.id)
    return { token, user }
  }

  @Get('me')
  @UseGuards(JwtGuard)
  async me(@CurrentUser() userId: string): Promise<UserDto> {
    return this.authService.getUserById(userId)
  }

  @Post('daily-claim')
  @UseGuards(JwtGuard)
  async claimDaily(@CurrentUser() userId: string): Promise<DailyClaimResult> {
    return this.authService.claimDaily(userId)
  }

  /** 为用户建立内置插件记录（幂等，文档 7.3.6：内置与第三方插件数据模型一致） */
  private async seedPlugins(userId: string): Promise<void> {
    try {
      const manifests: PluginManifest[] = this.cordisHost.getManifests()
      await this.pluginRegistry.ensureInstalledForUser(userId, manifests)
    } catch (err) {
      // seed 失败不阻断登录（下次登录重试）
      console.error('[AuthController] 插件记录 seed 失败：', (err as Error).message)
    }
  }
}
