import { Module } from '@nestjs/common'
import { ServicesModule } from './services.module'
import { AuthController } from './auth/auth.controller'
import { NovelController } from './novels/novel.controller'
import { StylePackController } from './style-packs/style-pack.controller'
import { PluginController } from './plugins/plugin.controller'
import { ModelConfigController } from './model-configs/model-config.controller'
import { WritingController } from './writing/writing.controller'
import { ChatController } from './chat/chat.controller'
import { ChatDispatcherService } from './chat/chat-dispatcher.service'
import { CreditController } from './credits/credit.controller'
import { BridgeGateway } from './gateway/bridge.gateway'

/** 根模块：所有业务 Controller + WebSocket 网关（服务由全局 ServicesModule 提供） */
@Module({
  imports: [ServicesModule],
  controllers: [
    AuthController,
    NovelController,
    StylePackController,
    PluginController,
    ModelConfigController,
    WritingController,
    ChatController,
    CreditController,
  ],
  providers: [BridgeGateway, ChatDispatcherService],
})
export class AppModule {}
