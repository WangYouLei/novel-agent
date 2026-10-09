import { Global, Module, type Provider } from '@nestjs/common'
import {
  AuthService,
  BillingService,
  ChatService,
  ModelConfigService,
  NovelService,
  OutlineService,
  PluginRegistryService,
  SessionService,
  StylePackService,
  getDb,
  loadAppConfig,
  type AppConfig,
  type PrismaClient,
} from '@novelagent/application'
import { CordisHost } from './cordis.host'
import { APP_CONFIG, PRISMA } from './common/tokens'

/**
 * application 领域服务注册（全局模块）
 * 这些服务是纯 TS 类（非 Nest 风格），在此包装为单例 provider 供各 Controller 注入
 */
const providers: Provider[] = [
  {
    provide: APP_CONFIG,
    useFactory: (): AppConfig => loadAppConfig(),
  },
  {
    provide: PRISMA,
    useFactory: (): PrismaClient => getDb(),
  },
  {
    provide: AuthService,
    inject: [PRISMA, APP_CONFIG],
    useFactory: (prisma: PrismaClient, config: AppConfig) => new AuthService(prisma, config),
  },
  {
    provide: BillingService,
    inject: [PRISMA],
    useFactory: (prisma: PrismaClient) => new BillingService(prisma),
  },
  {
    provide: NovelService,
    inject: [PRISMA],
    useFactory: (prisma: PrismaClient) => new NovelService(prisma),
  },
  {
    provide: StylePackService,
    inject: [PRISMA],
    useFactory: (prisma: PrismaClient) => new StylePackService(prisma),
  },
  {
    provide: OutlineService,
    inject: [PRISMA],
    useFactory: (prisma: PrismaClient) => new OutlineService(prisma),
  },
  {
    provide: PluginRegistryService,
    inject: [PRISMA],
    useFactory: (prisma: PrismaClient) => new PluginRegistryService(prisma),
  },
  {
    provide: SessionService,
    inject: [PRISMA],
    useFactory: (prisma: PrismaClient) => new SessionService(prisma),
  },
  {
    provide: ChatService,
    inject: [PRISMA],
    useFactory: (prisma: PrismaClient) => new ChatService(prisma),
  },
  {
    provide: ModelConfigService,
    inject: [PRISMA, APP_CONFIG],
    useFactory: (prisma: PrismaClient, config: AppConfig) => new ModelConfigService(prisma, config),
  },
  CordisHost,
]

@Global()
@Module({
  providers,
  exports: [
    APP_CONFIG,
    PRISMA,
    AuthService,
    BillingService,
    NovelService,
    StylePackService,
    OutlineService,
    PluginRegistryService,
    SessionService,
    ChatService,
    ModelConfigService,
    CordisHost,
  ],
})
export class ServicesModule {}
