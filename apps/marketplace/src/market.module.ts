import { Module } from '@nestjs/common'
import { MarketController } from './market.controller'
import { MarketRegistryService } from './registry.service'

/** 市场服务根模块：单控制器 + 文件系统注册表 */
@Module({
  controllers: [MarketController],
  providers: [MarketRegistryService],
})
export class MarketModule {}
