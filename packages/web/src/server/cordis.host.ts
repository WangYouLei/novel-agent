import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { createRequire } from 'node:module'
import path from 'node:path'
import { Context } from '@novelagent/core'
import { SERVICE_IDS } from '@novelagent/core'
import type { FeatureExtensionPoint } from '@novelagent/core'
import { ModelService, type BillingHook } from '@novelagent/model-service'
import {
  resolveDependencies,
  scanLocalRepo,
  type PluginManifest,
  type ResolveResult,
} from '@novelagent/market-client'
import type { AppConfig } from '@novelagent/application'
import { APP_CONFIG } from './common/tokens'

/** 单个插件的运行时状态 */
export interface PluginRuntime {
  manifest: PluginManifest
  status: 'STARTED' | 'ERROR' | 'DEPENDENCY_MISSING'
  /** 依赖缺失描述（status=DEPENDENCY_MISSING 时有值） */
  missing?: string[]
  errorMessage?: string
}

/**
 * Cordis 宿主（文档 3.3 整合方式）：
 * - Nest 管 HTTP 与静态业务，Cordis 管插件生命周期与协作
 * - 业务代码不通过构造器注入 Cordis 服务（插件可动态启停），
 *   统一在运行时经 get() 动态获取，缺失返回 undefined 由业务层转译（规则 1/2）
 * - MVP 阶段插件不注册 HTTP 路由，对外入口全部收口在 Nest controller（规则 3）
 * - 任何插件加载失败只记录并禁用该插件，不阻断应用启动（规则 4 / 6.8 故障隔离）
 */
@Injectable()
export class CordisHost implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CordisHost')
  readonly root = new Context()

  /** pluginId → 运行状态 */
  readonly runtimes = new Map<string, PluginRuntime>()
  private resolveResult: ResolveResult = { loadOrder: [], skipped: [], cyclic: [] }

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** 业务代码获取插件服务的唯一入口（文档 3.3 示例 get 方法） */
  get<T>(serviceId: string): T | undefined {
    return this.root.get(serviceId) as T | undefined
  }

  /** 便捷获取功能插件（大纲生成等） */
  getFeature<T extends FeatureExtensionPoint = FeatureExtensionPoint>(featureId: string): T | undefined {
    return this.get<T>(featureId)
  }

  /** 所有扫描到的清单（含未加载的） */
  getManifests(): PluginManifest[] {
    return [...this.runtimes.values()].map((r) => r.manifest)
  }

  getManifest(pluginId: string): PluginManifest | undefined {
    return this.runtimes.get(pluginId)?.manifest
  }

  /** 依赖解析结果（供插件管理页展示缺失依赖） */
  getResolveResult(): ResolveResult {
    return this.resolveResult
  }

  async onModuleInit() {
    // 1. 注册内核 ModelService（内置模型，文档 5.1）
    this.root.plugin(ModelService)

    // 2. 扫描插件目录 + 依赖解析（文档 6.3 加载机制）
    const pluginsDir = path.join(this.config.dataRoot, 'plugins')
    const manifests = scanLocalRepo(pluginsDir, (msg) => this.logger.log(msg))
    this.resolveResult = resolveDependencies(manifests)

    for (const { manifest, missing } of this.resolveResult.skipped) {
      this.runtimes.set(manifest.pluginId, {
        manifest,
        status: 'DEPENDENCY_MISSING',
        missing,
      })
      this.logger.warn(`插件 [${manifest.pluginId}] 依赖缺失，未加载：${missing.join(', ')}`)
    }
    for (const manifest of this.resolveResult.cyclic) {
      this.runtimes.set(manifest.pluginId, {
        manifest,
        status: 'ERROR',
        errorMessage: '依赖关系成环',
      })
    }

    // 3. 按依赖顺序加载插件（可逆副作用：注册的服务/事件随 scope 管理）
    for (const manifest of this.resolveResult.loadOrder) {
      await this.loadPlugin(manifest)
    }

    // 4. 启动 Cordis
    await this.root.start()
    this.logger.log(
      `插件内核就绪：成功 ${this.countByStatus('STARTED')}，失败 ${this.countByStatus('ERROR')}，依赖缺失 ${this.countByStatus('DEPENDENCY_MISSING')}`,
    )
  }

  async onModuleDestroy() {
    // 停止 Cordis：自动回滚所有插件注册的副作用（文档 4.6）
    await this.root.stop()
  }

  /** Web 启动层注入计费实现（在 Nest 启动后、首个请求前调用） */
  setBillingHook(hook: BillingHook): void {
    const modelService = this.get<ModelService>(SERVICE_IDS.MODEL)
    modelService?.setBillingHook(hook)
  }

  /** 加载单个插件：动态 require 入口 → Cordis plugin()（失败隔离） */
  private async loadPlugin(manifest: PluginManifest): Promise<void> {
    try {
      const entryPath = path.join(manifest.installPath, manifest.entryFile)
      // createRequire 相对插件入口解析依赖（DATA_ROOT/node_modules 下的共享链接）
      const require = createRequire(entryPath)
      const mod = require(entryPath) as { default?: unknown }
      const pluginCtor = mod.default ?? mod
      if (typeof pluginCtor !== 'function') {
        throw new Error('入口未导出插件类（default export）')
      }
      // 用户级配置在请求层注入（FeatureRequest.config），进程级加载传空配置
      this.root.plugin(pluginCtor as new (ctx: Context, config: unknown) => unknown, {})
      this.runtimes.set(manifest.pluginId, { manifest, status: 'STARTED' })
      this.logger.log(`插件已加载：${manifest.pluginId}@${manifest.version}`)
    } catch (err) {
      this.runtimes.set(manifest.pluginId, {
        manifest,
        status: 'ERROR',
        errorMessage: (err as Error).message,
      })
      // 故障隔离：单个插件失败不阻断启动（文档 6.8）
      this.logger.error(`插件 [${manifest.pluginId}] 加载失败：${(err as Error).stack ?? err}`)
    }
  }

  private countByStatus(status: PluginRuntime['status']): number {
    return [...this.runtimes.values()].filter((r) => r.status === status).length
  }
}
