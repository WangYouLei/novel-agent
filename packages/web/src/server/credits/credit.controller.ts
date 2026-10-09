import { Controller, Get, UseGuards } from '@nestjs/common'
import { AuthService } from '@novelagent/application'
import type { CreditLogDto } from '@novelagent/shared'
import { JwtGuard } from '../common/jwt.guard'
import { CurrentUser } from '../common/current-user.decorator'

/** 积分控制器：余额（随用户信息）/ 流水查询 */
@Controller('api/credits')
@UseGuards(JwtGuard)
export class CreditController {
  constructor(private readonly authService: AuthService) {}

  @Get('logs')
  async logs(@CurrentUser() userId: string): Promise<CreditLogDto[]> {
    return this.authService.listCreditLogs(userId)
  }
}
