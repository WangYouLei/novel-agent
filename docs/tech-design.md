# NovelAgent 技术设计文档

> 版本：v0.2
> 日期：2026-10-08
> 状态：讨论稿（主方案：全栈 TypeScript）
> 关联文档：[产品需求文档 (PRD)](./prd.md)

---

## 1. 文档概述

本文档定义 NovelAgent 的 TypeScript 技术实现方案（主选方案）。

**核心技术选择**：使用 **Cordis**（源自 Koishi 的插件元框架）作为插件内核，避免自研插件内核的工程成本；前后端同语言，共享类型定义和插件协议。

产品需求请参考 [PRD](./prd.md)。

---

## 2. 技术选型

| 层面 | 选型 | 版本 | 说明 |
|------|------|------|------|
| **语言** | TypeScript | 5.x | 全栈统一，类型安全 |
| **包管理** | pnpm + monorepo | - | workspace 管理多包，磁盘占用低 |
| **后端框架** | Nest.js | 10.x | 企业级后端框架，依赖注入、模块化，与 Spring Boot 设计哲学相似 |
| **插件内核** | Cordis | 最新 | 源自 Koishi 的 TS 插件元框架，提供生命周期、服务注册、事件总线、可逆副作用 |
| **ORM** | Prisma | 5.x | TS 生态首选，类型安全，schema 即文档，迁移工具全 |
| **数据库** | SQLite（MVP）→ PostgreSQL | - | MVP 嵌入式零部署，预留切换能力 |
| **前端框架** | Vue | 3.x | Composition API，国内生态好 |
| **前端 UI 库** | Element Plus | 最新 | 组件丰富，中后台场景成熟 |
| **前端状态管理** | Pinia | - | Vue 官方推荐，轻量易用 |
| **实时通信** | Socket.IO | - | WebSocket 封装，前后端事件桥接 + 流式输出 |
| **前端构建** | Vite | 5.x | 开发体验好，HMR 快 |
| **后端/库构建** | tsup | - | 基于 esbuild，快速打包 TS 库 |
| **代码规范** | ESLint + Prettier | - | 统一风格 |
| **测试** | Vitest | - | Vite 原生测试框架，速度快 |

### 2.1 为什么选全栈 TypeScript

| 维度 | 说明 |
|------|------|
| **插件内核** | Cordis 是经过验证的 TS 插件框架，省去自研内核的工程成本 |
| **AI 生态** | Node.js 生态的 LLM SDK、向量库、工具链比 Java 更丰富、跟进更快 |
| **前后端同语言** | 类型定义共享、插件协议统一、开发体验一致 |
| **插件生态潜力** | JS/TS 开发者基数大，第三方写插件门槛低 |
| **开发效率** | 前后端同语言，减少切换成本，共享类型定义 |

### 2.2 为什么前端也用 Cordis

这一做法参考了 DeepSeek Harness 的全栈 Cordis 架构（前后端各运行一个 Cordis Context，经 WebSocket 桥接）：

| 好处 | 说明 |
|------|------|
| **插件自带 UI** | 功能插件可以同时贡献后端逻辑和前端页面，安装一个插件 = 功能+UI 全有 |
| **前后端共享协议** | 插件的类型定义、事件协议、服务接口前后端复用 |
| **实时性** | WebSocket 长连接，AI 流式输出、进度通知天然支持 |
| **避免返工** | 后续如需前端插件化，架构已就位，不用改 |

**代价**：复杂度上升（Bridge 层设计、状态同步），MVP 阶段做减法（前端只做核心框架，功能页面逐步插件化）。

---

## 3. 系统架构

### 3.1 分层架构图

```
┌─────────────────────────────────────────────────────────────┐
│  前端 Cordis Context                                         │
│  ┌──────────┬──────────┬─────────┬───────────────────────┐  │
│  │ UI 插件   │ 状态插件 │ 路由插件 │ 前端功能插件(自带UI)  │  │
│  └──────────┴──────────┴─────────┴───────────────────────┘  │
│                     │                                       │
│            ┌────────▼────────┐                              │
│            │  Bridge 插件     │ ← WebSocket 连接两端       │
│            │  事件/服务代理    │   Cordis Context            │
│            └────────┬────────┘                              │
└─────────────────────┼───────────────────────────────────────┘
                      │ WebSocket（事件双向同步）
┌─────────────────────┼───────────────────────────────────────┐
│  后端 Cordis Context                                        │
│            ┌────────▼────────┐                              │
│            │  Bridge 插件     │                              │
│            └────────┬────────┘                              │
│  ┌─────────┬─────────┬─────────┬──────────────────────┐    │
│  │模型插件 │功能插件  │风格生成  │ 存储/持久化插件       │    │
│  └─────────┴─────────┴─────────┴──────────────────────┘    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Nest.js (HTTP 层、模块化、依赖注入)                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**核心思想**：Cordis 跑在 Nest.js 里面。Nest.js 管 HTTP 请求和业务模块，Cordis 管插件的加载和协作。功能插件通过 Cordis 的 service 暴露能力，Nest.js 的 controller 调用这些 service 来响应请求。

### 3.2 Monorepo 模块划分

```
novel-agent/
├── package.json                    # 根 package（workspace 配置）
├── pnpm-workspace.yaml
├── tsconfig.base.json              # 共享 TS 配置
├── packages/                       # 所有包
│   ├── core/                       # 插件内核（Cordis 封装 + 通用类型）
│   │   ├── src/
│   │   │   ├── plugin-context.ts   # Cordis Context 封装
│   │   │   ├── extension-points.ts # 扩展点接口定义
│   │   │   ├── events.ts           # 全局事件类型
│   │   │   ├── services.ts         # 内核服务声明
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── application/                # 应用服务层
│   │   ├── src/
│   │   │   ├── writing/            # 创作流程编排
│   │   │   ├── user/               # 用户与权限
│   │   │   ├── billing/            # 积分与计费
│   │   │   └── style-pack/         # 风格包管理
│   │   └── package.json
│   │
│   ├── model-service/              # 模型服务（混合模式）
│   │   ├── src/
│   │   │   ├── builtin/            # 内置免费模型（带计费hook）
│   │   │   ├── provider-spi/       # 模型提供者 SPI
│   │   │   └── router/             # 模型路由
│   │   └── package.json
│   │
│   ├── market-client/              # 插件市场客户端
│   │   ├── src/
│   │   │   ├── local-repo.ts       # 本地插件仓库
│   │   │   ├── installer.ts        # 安装/卸载
│   │   │   └── remote-api.ts       # 远程市场 API（预留）
│   │   └── package.json
│   │
│   ├── web/                         # 后端 HTTP + 前端
│   │   ├── src/
│   │   │   ├── server/              # Nest.js 后端
│   │   │   │   ├── controllers/
│   │   │   │   ├── gateway/         # WebSocket Gateway
│   │   │   │   └── modules/
│   │   │   └── client/              # Vue 3 前端
│   │   │       ├── pages/
│   │   │       ├── components/
│   │   │       ├── stores/
│   │   │       └── bridge/          # 前端 Cordis Bridge
│   │   └── package.json
│   │
│   ├── plugins/                     # 官方插件实现
│   │   ├── outline-generator/       # 示例：大纲生成
│   │   │   ├── src/
│   │   │   │   ├── index.ts         # 插件入口
│   │   │   │   └── feature.ts       # FeatureExtensionPoint 实现
│   │   │   ├── package.json         # novelagent 字段声明
│   │   │   └── README.md
│   │   └── openai-model/            # 示例：OpenAI 模型
│   │       ├── src/
│   │       │   ├── index.ts
│   │       │   └── provider.ts      # ModelProvider 实现
│   │       └── package.json
│   │
│   └── shared/                      # 共享类型和工具
│       ├── src/
│       │   ├── types/               # 前后端共享类型
│       │   ├── utils/
│       │   └── constants/
│       └── package.json
│
└── apps/
    └── launcher/                     # 启动器
        ├── src/
        │   └── main.ts              # 应用入口
        └── package.json
```

### 3.3 Cordis 与 Nest.js 的整合

架构上两套容器并存（Nest 的 DI 容器 + Cordis 的服务注册表），必须明确分工与桥接方式，避免"双 DI 打架"。

**分工原则**：

| 容器 | 职责 | 特征 |
|------|------|------|
| Nest.js | 应用级静态部分：HTTP 路由、鉴权、全局管道、配置 | 启动时确定，运行期不变 |
| Cordis | 插件级动态部分：可插拔的服务、事件、生命周期 | 运行期随插件启停动态变化 |

**整合方式（示意）**——用一个 Nest Provider 承载 Cordis 生命周期：

```typescript
// packages/web/src/server/cordis.host.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { App } from 'cordis'

@Injectable()
export class CordisHost implements OnModuleInit, OnModuleDestroy {
  private app = new App()

  /** 业务代码获取插件服务的唯一入口 */
  get<T>(serviceId: string): T | undefined {
    return this.app.get(serviceId)
  }

  async onModuleInit() {
    // 扫描插件目录 → 依赖解析 → 按依赖顺序 ctx.plugin(...) 加载
    await loadPlugins(this.app)
    await this.app.start()
  }

  async onModuleDestroy() {
    // 停止 Cordis，自动回滚所有插件注册的副作用
    await this.app.stop()
  }
}
```

**整合规则**：

1. Nest 的 controller/service **不通过 constructor 注入 Cordis 服务**（插件可卸载，静态注入会悬空），统一在运行时经 `CordisHost.get()` 动态获取。
2. 服务缺失时 `get()` 返回 `undefined`，业务层转译为业务错误（如"缺少模型提供者"），对应 PRD 6.3 验收标准 5。
3. MVP 阶段 Cordis 插件不直接注册 HTTP 路由，对外 HTTP 入口全部收口在 Nest controller，controller 内部调用插件服务。
4. 启动顺序：Nest bootstrap → `CordisHost.onModuleInit`（插件加载完成）→ 开始对外提供 HTTP 服务；任何插件加载失败只记录错误与禁用该插件，不阻断应用启动（对应 6.8 故障隔离）。

---

## 4. 插件内核设计（基于 Cordis）

### 4.1 Cordis 核心概念

| 概念 | 作用 |
|------|------|
| **Context** | 所有插件共享的上下文对象，插件向 context 注册服务和事件 |
| **Service** | 插件暴露能力的方式，其他插件通过 `ctx.xxx` 调用 |
| **Typed Events** | TypeScript 声明合并实现全链路类型安全的事件系统 |
| **Reversible Effects** | 插件注册的所有东西在卸载时自动回滚 |
| **Fiber Lifecycle** | 插件精细的生命周期阶段，支持依赖顺序启动 |
| **Bundle** | 配置行 + 代码的分发格式，可被上层 patch |
| **Profile** | 命名的组合，堆叠多个 bundle（未来扩展：插件套装） |

### 4.2 插件描述符（package.json + novelagent 字段）

每个插件是一个 npm 包，`package.json` 中通过 `novelagent` 字段声明元数据：

```json
{
  "name": "@novelagent/plugin-outline-generator",
  "version": "1.0.0",
  "main": "dist/index.js",
  "novelagent": {
    "id": "outline-generator",
    "displayName": "大纲生成",
    "type": "feature",
    "description": "根据一句话创意生成完整小说大纲",
    "dependencies": {
      "model-service": ">=1.0.0"
    },
    "optionalDependencies": {
      "style-pack-service": "~2.1.0"
    },
    "styleRequirement": {
      "mode": "prefer",
      "compatibleBuiltinStyles": ["xuanhuan", "dushi", "scifi"],
      "recommendedPackIds": ["steampunk-hardcore"],
      "embeddedFallback": {
        "promptTemplate": "...",
        "vocabPreferences": []
      }
    },
    "configSchema": [
      {
        "key": "chapterCount",
        "name": "章节数量",
        "type": "number",
        "default": 20,
        "min": 5,
        "max": 100
      }
    ]
  }
}
```

### 4.3 插件实现示例

```typescript
// packages/plugins/outline-generator/src/index.ts
import { Context, Service } from '@novelagent/core'
import type { FeatureExtensionPoint, FeatureResult, FeatureRequest } from '@novelagent/core'

class OutlineGenerator extends Service implements FeatureExtensionPoint {
  constructor(ctx: Context, config: OutlineGeneratorConfig) {
    super(ctx, 'outline-generator', true)
  }

  get featureId() { return 'outline-generator' }
  get featureName() { return '大纲生成' }

  async execute(request: FeatureRequest): Promise<FeatureResult> {
    // 1. 获取模型服务
    const modelService = this.ctx.get('model-service')
    
    // 2. 获取风格包服务（可选）
    const styleService = this.ctx.getOptional('style-pack-service')
    const style = await styleService?.getActiveStyle(request.novelId)
    
    // 3. 构建提示词
    const prompt = this.buildPrompt(request, style, this.config)
    
    // 4. 调用模型
    const response = await modelService.chat({
      prompt,
      model: request.model,
    })
    
    // 5. 解析大纲结构
    const outline = this.parseOutline(response.content)
    
    // 6. 发布事件（其他插件可订阅）
    this.ctx.emit('outline-generated', { novelId: request.novelId, outline })
    
    return { success: true, data: outline }
  }

  private buildPrompt(req: FeatureRequest, style: StylePack | undefined, config: OutlineGeneratorConfig): string {
    // ...
  }

  private parseOutline(content: string): OutlineStructure {
    // ...
  }
}

export default OutlineGenerator
```

### 4.4 扩展点接口定义

```typescript
// packages/core/src/extension-points.ts

import { Service } from 'cordis'

/** 所有扩展点的基类 */
export abstract class ExtensionPoint extends Service {
  abstract readonly extensionId: string
}

/** 功能扩展点：创作功能模块 */
export abstract class FeatureExtensionPoint extends ExtensionPoint {
  abstract readonly featureId: string
  abstract readonly featureName: string
  abstract execute(request: FeatureRequest): Promise<FeatureResult>
}

/** 模型扩展点：AI 模型提供者 */
export abstract class ModelProvider extends ExtensionPoint {
  abstract readonly providerId: string
  abstract readonly providerName: string
  abstract chat(request: ModelRequest): Promise<ModelResponse>
  abstract complete(request: ModelRequest): Promise<ModelResponse>
  abstract supportsStreaming(): boolean
}

/** 风格生成扩展点 */
export abstract class StyleGeneratorExtensionPoint extends ExtensionPoint {
  abstract readonly generatorId: string
  abstract readonly generatorName: string
  abstract generate(request: StyleGenerateRequest): Promise<StylePackData>
}
```

### 4.5 事件系统（类型安全）

```typescript
// packages/core/src/events.ts

// 通过声明合并定义所有事件类型
declare module '@novelagent/core' {
  interface Events {
    'outline-generated': [data: { novelId: string; outline: OutlineStructure }]
    'chapter-written': [data: { novelId: string; chapterId: string }]
    'style-pack-changed': [data: { novelId: string; stylePackId: string }]
    'plugin-installed': [data: { pluginId: string; version: string }]
    'plugin-uninstalled': [data: { pluginId: string }]
  }
}

// 使用时全链路类型安全
ctx.on('outline-generated', (data) => {
  // data.novelId: string
  // data.outline: OutlineStructure
})
```

### 4.6 可逆副作用

Cordis 的核心特性之一 —— 插件注册的所有东西在卸载时自动回滚：

```typescript
export default class MyPlugin {
  constructor(ctx: Context, config: MyConfig) {
    // 注册服务 —— 卸载时自动注销
    ctx.plugin(MyFeatureService)
    
    // 注册事件监听 —— 卸载时自动取消
    ctx.on('outline-generated', (data) => {
      // ...
    })
    
    // 注册定时任务 —— 卸载时自动取消
    ctx.timer.setInterval(() => {
      // ...
    }, 60000)
    
    // 注册 HTTP 路由 —— 卸载时自动移除
    ctx.router.get('/my-plugin/api', (koa) => {
      // ...
    })
  }
}
```

### 4.7 前后端 Bridge

```typescript
// packages/web/src/client/bridge/index.ts
import { Context } from 'cordis'
import { io } from 'socket.io-client'

export class BridgePlugin {
  constructor(ctx: Context) {
    const socket = io('/plugin-bridge')
    
    // 后端事件 → 前端
    socket.on('event', (name: string, payload: unknown) => {
      ctx.emit(name as never, payload as never)
    })
    
    // 前端服务调用 → 后端
    ctx.provide('remote-call', async (serviceId: string, method: string, ...args: unknown[]) => {
      return new Promise((resolve, reject) => {
        socket.emit('service-call', { serviceId, method, args }, (result: any) => {
          if (result.error) reject(result.error)
          else resolve(result.data)
        })
      })
    })
    
    // 前端事件 → 后端
    ctx.on(/^(?!.*-local$)/, (payload, name) => {
      socket.emit('event', name, payload)
    })
  }
}
```

---

## 5. 模型服务设计

### 5.1 混合模式架构

模型层 = 内置免费模型（核心服务+计费） + 自定义厂商模型（插件），对外统一 `ModelProvider` 接口。

```
┌──────────────────────────────────────────────────┐
│  ModelService (统一调用入口，Cordis Service)        │
│  - 路由：根据请求选择 provider                     │
│  - 计费hook：内置模型调用前扣积分                   │
│  - 限流 / 重试 / 降级                              │
└───────┬───────────────────────────────┬──────────┘
        │ 内置                          │ 插件
┌───────▼──────────┐          ┌────────▼──────────┐
│ BuiltinModelProvider │      │ 插件 ModelProvider │
│ - 调用平台API      │      │ - OpenAI / Claude  │
│ - 积分扣费逻辑     │      │ - 本地模型         │
│ - VIP 权益判断     │      │ - 自定义厂商       │
└───────────────────┘          └───────────────────┘
```

### 5.2 计费 Hook 机制

```typescript
export interface BillingHook {
  /** 调用前扣费，返回 true 表示扣费成功 */
  charge(request: ModelRequest, account: UserAccount): Promise<boolean>
  /** 调用失败时退费 */
  refund(request: ModelRequest, account: UserAccount, reason: string): Promise<void>
}
```

- 内置 provider 绑定计费 hook
- 插件 provider 不绑定（用户用自己的 API Key）
- ModelService 在路由时根据 provider 类型决定是否执行计费

---

## 6. 插件市场与插件管理

### 6.1 MVP 范围

- ✅ 本地插件仓库管理（`~/.novelagent/plugins/`）
- ✅ 插件安装/卸载/启用/禁用
- ✅ 插件元数据读取与展示
- ✅ 依赖缺失检测与提示
- ✅ 插件配置管理（参数 schema + 动态表单）
- ⏸️ 远程市场 API 契约定义（预留接口，不实现服务端）

### 6.2 应用数据目录布局（DATA_ROOT）

```
<DATA_ROOT>/                      # 应用数据根目录（解析规则见下）
├── novelagent.db                 # SQLite 数据库
├── files/                        # 二进制资源（封面/头像/插图），数据库只存相对路径（见 ADR-012）
├── plugins/                      # 插件仓库
│   ├── outline-generator/        # 每个插件一个目录
│   │   ├── package.json          # npm 包描述（含 novelagent 字段）
│   │   ├── dist/                 # 编译产物
│   │   ├── config.json           # 用户配置（运行时生成/修改）
│   │   └── .meta/                # 安装元数据
│   │       ├── installedAt
│   │       ├── source            # builtin/local/marketplace
│   │       └── signature
│   └── openai-model/
│       └── ...
├── node_modules/                 # pnpm 管理的插件依赖（符号链接）
├── styles/                       # 风格包资源
└── logs/
```

**DATA_ROOT 解析规则**：开发模式默认 `~/.novelagent/`；打包单机版默认为可执行文件旁的 `data/` 目录（绿色便携）；可通过环境变量覆盖。9.1 部署图与本节为同一布局。

### 6.3 插件加载机制

```
应用启动
  ↓
扫描 plugins/ 目录
  ↓
读取每个 package.json 的 novelagent 字段
  ↓
依赖解析（npm semver 语义化版本）
  ↓
Cordis 按依赖顺序加载插件
  ↓
插件注册 Service / 事件 / 路由（可逆副作用）
  ↓
内核就绪，对外提供服务
```

### 6.4 依赖解析

Cordis 内置依赖解析，使用 npm semver 语法：

| 表达式 | 含义 |
|--------|------|
| `1.0.0` | 精确等于 |
| `>=1.0.0` | 大于等于 |
| `~1.2.3` | 兼容 1.2.x |
| `^1.2.3` | 兼容 1.x.x |
| `*` | 任意版本 |

**依赖缺失处理**：
- 必需依赖缺失 → 插件加载失败，UI 提示
- 可选依赖缺失 → 插件正常加载，部分功能受限

### 6.5 插件配置管理

```typescript
// 插件通过 Config 声明可配置参数
export interface OutlineGeneratorConfig {
  chapterCount?: number
  plotTwistFrequency?: 'low' | 'medium' | 'high'
  includeForeshadowing?: boolean
}

export default class OutlineGenerator {
  // 使用 Cordis Schema 定义配置
  static schema = {
    chapterCount: { type: 'number', default: 20, min: 5, max: 100 },
    plotTwistFrequency: { type: 'string', default: 'medium' },
    includeForeshadowing: { type: 'boolean', default: true },
  }
  
  constructor(ctx: Context, config: OutlineGeneratorConfig) {
    // config 已经过 Schema 校验和默认值填充
    console.log(config.chapterCount) // 20
  }
}
```

### 6.6 热加载机制

Cordis 支持 `ctx.plugin(unload)` 卸载插件，自动回滚所有副作用：

```typescript
// 加载插件
const dispose = ctx.plugin(MyPlugin, config)

// 卸载插件（回滚所有注册的 service/event/route）
dispose()
```

文件监听：使用 `chokidar` 监听插件目录变更，触发卸载旧版本 → 加载新版本。

### 6.7 远程市场（未来扩展）

```typescript
export interface MarketplaceClient {
  searchPlugins(keyword: string, category?: string, page?: number, size?: number): Promise<Page<PluginSummary>>
  getPluginDetail(pluginId: string): Promise<PluginDetail>
  getPluginVersions(pluginId: string): Promise<PluginVersion[]>
  downloadPlugin(pluginId: string, version: string): Promise<string>
  checkUpdates(installed: InstalledPlugin[]): Promise<PluginUpdate[]>
  getCategories(): Promise<PluginCategory[]>
  isAvailable(): boolean
}
```

**MVP 实现**：`MockMarketplaceClient` —— 全部方法返回空，后续替换为 `HttpMarketplaceClient`。

### 6.8 错误处理与故障隔离

Cordis 提供错误隔离：
- 插件加载失败不影响其他插件
- 插件抛出的未捕获异常被 Cordis 捕获，记录日志
- 事件监听器异常不影响其他监听器

**插件隔离级别**（未来扩展）：
- `SAME_PROCESS`：同进程（MVP 默认，Cordis 天然隔离）
- `WORKER_THREAD`：Worker 线程隔离（不信任插件）
- `CHILD_PROCESS`：子进程隔离（高风险插件）

---

## 7. 数据库设计

### 7.1 设计原则

- **MVP 使用 SQLite**：嵌入式零部署
- **Prisma 抽象数据访问**：切换数据库只需改 datasource provider
- **Prisma Migrate**：版本化管理 schema 演进
- **JSON 字段策略**：扩展属性用 JSON，核心查询字段独立列
- **软删除**：业务数据使用逻辑删除

### 7.2 ER 图概览

```
User ──┬──< Novel ──< Chapter
       │      ∧                     CharacterRelation
       │      ├──< Character ──┬──< (fromCharacter)
       │      │                └──< (toCharacter)
       │      ├──< WorldSetting (自引用树)
       │      ├──< Outline
       │      └──< WritingSession ──< ModelCall
       │
       ├──< StylePack (fork 关系自引用)
       ├──< InstalledPlugin ──< ModelConfig
       └──< CreditLog
```

### 7.3 Prisma Schema

```prisma
// 7.3.1 用户与计费
model User {
  id              String     @id @default(cuid())
  username        String     @unique
  email           String?    @unique
  passwordHash    String?
  avatar          String?
  role            UserRole   @default(USER)
  vipExpiresAt    DateTime?
  credits         Int        @default(0)
  dailyCredits    Int        @default(0)
  lastDailyClaim  DateTime?
  deleted         Boolean    @default(false)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  novels          Novel[]
  stylePacks      StylePack[]
  installedPlugins InstalledPlugin[]
  sessions        WritingSession[]
  creditLogs      CreditLog[]
  modelCalls      ModelCall[]
}

enum UserRole {
  USER
  VIP
  ADMIN
}

model CreditLog {
  id           String         @id @default(cuid())
  userId       String
  user         User           @relation(fields: [userId], references: [id])
  amount       Int
  type         CreditLogType
  description  String?
  modelCallId  String?
  createdAt    DateTime       @default(now())

  @@index([userId, createdAt])
}

enum CreditLogType {
  DAILY_GIFT
  MODEL_CALL
  VIP_BENEFIT
  REFUND
  ADMIN_ADJUST
}

// 7.3.2 小说与章节
model Novel {
  id                   String       @id @default(cuid())
  userId               String
  user                 User         @relation(fields: [userId], references: [id])
  title                String
  description          String?
  coverImage           String?
  genre                String?
  stylePackId          String?
  stylePack            StylePack?   @relation(fields: [stylePackId], references: [id])
  status               NovelStatus  @default(DRAFT)
  wordCount            Int          @default(0)
  deleted              Boolean      @default(false)
  createdAt            DateTime     @default(now())
  updatedAt            DateTime     @updatedAt

  chapters            Chapter[]
  characters          Character[]
  worldSettings       WorldSetting[]
  outlines            Outline[]
  sessions            WritingSession[]

  @@index([userId])
}

enum NovelStatus {
  DRAFT
  ONGOING
  COMPLETED
  ARCHIVED
}

model Chapter {
  id          String        @id @default(cuid())
  novelId     String
  novel       Novel         @relation(fields: [novelId], references: [id], onDelete: Cascade)
  // 排序字段：初始步长 100（追加时 = max + 100，插入时取前后两值的中点）
  // "第X章"的展示序号由查询时 ROW_NUMBER() 动态生成，不落库（避免插入时全表重排）
  sortOrder   Int
  title       String
  summary     String?
  content     String?
  wordCount   Int           @default(0)
  status      ChapterStatus @default(DRAFT)
  stylePackId String?
  stylePack   StylePack?    @relation(fields: [stylePackId], references: [id])
  deleted     Boolean       @default(false)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@index([novelId, sortOrder])
}

enum ChapterStatus {
  DRAFT
  OUTLINED
  WRITING
  REVIEWING
  PUBLISHED
}

// 7.3.3 风格包
model StylePack {
  id              String           @id @default(cuid())
  userId          String?
  user            User?            @relation(fields: [userId], references: [id])
  name            String
  description     String?
  coverImage      String?
  sourceType      StylePackSource
  generatedBy     String?
  sourcePluginId  String?
  version         String           @default("1.0.0")
  modifiable      Boolean          @default(true)
  content         Json
  forkedFromId    String?
  forkedFrom      StylePack?       @relation("StylePackFork", fields: [forkedFromId], references: [id])
  deleted         Boolean          @default(false)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt

  novels          Novel[]
  chapters        Chapter[]

  @@index([userId])
  @@index([sourceType])
}

enum StylePackSource {
  BUILTIN
  USER_GENERATED
  THIRD_PARTY
}

// 7.3.4 设定管理
model Character {
  id            String          @id @default(cuid())
  novelId       String
  novel         Novel           @relation(fields: [novelId], references: [id], onDelete: Cascade)
  name          String
  alias         String?
  avatar        String?
  role          CharacterRole
  gender        String?
  age           String?
  description   String?
  profile       Json?
  sortOrder     Int             @default(0)
  deleted       Boolean         @default(false)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  relationsFrom CharacterRelation[] @relation("RelationFrom")
  relationsTo   CharacterRelation[] @relation("RelationTo")

  @@index([novelId])
}

enum CharacterRole {
  PROTAGONIST
  DEUTERAGONIST
  ANTAGONIST
  SUPPORTING
  MINOR
  NARRATOR
}

// 角色关系表：单向存储（A→B），查询某角色全部关系时双向 UNION
// 独立成表的原因：关系网是高频查询场景（写作时要喂给模型），且删除角色时靠外键级联清理
model CharacterRelation {
  id           String    @id @default(cuid())
  novelId      String
  novel        Novel     @relation(fields: [novelId], references: [id], onDelete: Cascade)
  fromCharacterId String
  fromCharacter Character @relation("RelationFrom", fields: [fromCharacterId], references: [id], onDelete: Cascade)
  toCharacterId   String
  toCharacter     Character @relation("RelationTo", fields: [toCharacterId], references: [id], onDelete: Cascade)
  relationType String    // 关系类型：师徒/敌对/恋人/盟友/亲属...（自由文本或字典）
  description  String?
  createdAt    DateTime  @default(now())

  @@unique([fromCharacterId, toCharacterId, relationType])
  @@index([novelId])
  @@index([toCharacterId])
}

model WorldSetting {
  id          String   @id @default(cuid())
  novelId     String
  novel       Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  category    String
  name        String
  description String?
  icon        String?
  details     Json?
  parentId    String?
  parent      WorldSetting? @relation("WorldSettingTree", fields: [parentId], references: [id])
  children    WorldSetting[] @relation("WorldSettingTree")
  sortOrder   Int      @default(0)
  deleted     Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([novelId, category])
}

// 7.3.5 大纲
// structure JSON 树中的 chapter 类型节点带可选 chapterId 字段，关联 chapter 表
// 说明：章节管理不在 MVP 范围（PRD 4.1），MVP 大纲流程只保存大纲本身，不创建章节占位；
//   chapterId 为后续"大纲↔章节"联动预留（届时生成章节骨架时回写，支持双向跳转与状态回写）
// chapterId 无外键约束（JSON 内引用），悬空引用由应用层保存时校验兜底
model Outline {
  id               String   @id @default(cuid())
  novelId          String
  novel            Novel    @relation(fields: [novelId], references: [id], onDelete: Cascade)
  version          Int      @default(1)
  isActive         Boolean  @default(true)
  structure        Json     // 树形故事节点，chapter 节点含可选 chapterId
  generatedBy      String?
  generationParams Json?
  deleted          Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([novelId, isActive])
}

// 7.3.6 插件管理与模型配置
// userId 必填：MVP 确认有登录系统，所有插件记录关联用户
// 内置插件策略：用户首次登录时为其 seed 一批 installed_plugin 记录（source=BUILTIN）
//   —— 内置插件与第三方插件在数据模型上完全一致，用户可独立启用/禁用/配置
model InstalledPlugin {
  id           String        @id @default(cuid())
  userId       String
  user         User          @relation(fields: [userId], references: [id])
  pluginId     String
  name         String
  version      String
  author       String?
  description  String?
  type         PluginType
  source       PluginSource
  installPath  String?
  status       PluginStatus  @default(INSTALLED)
  enabled      Boolean       @default(true)
  config       Json?
  dependencies Json?
  installedAt  DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  modelConfigs ModelConfig[]

  @@unique([userId, pluginId])
  @@index([userId, status])
}

enum PluginType {
  FEATURE
  MODEL
  STYLE_GENERATOR
}

enum PluginSource {
  BUILTIN
  LOCAL
  MARKETPLACE
}

// 用户模型配置表：用户自定义厂商模型的 API Key / 端点 / 模型名
// 独立成表的原因：
//   1. 模型插件是全局代码，但 API Key 是用户资产，不能混在插件全局配置里
//   2. 一个厂商插件下用户可配多个模型条目（如 gpt-4o、gpt-4o-mini）
//   3. apiKeyEncrypted 单独加密存储（未来引入加密方案时只影响这一列）
model ModelConfig {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  installedPluginId String   // 来源模型插件（如 openai-model）
  installedPlugin   InstalledPlugin @relation(fields: [installedPluginId], references: [id])
  name              String   // 用户起的显示名，如"我的GPT"
  baseUrl           String?  // 自定义端点（兼容代理/中转）
  apiKeyEncrypted   String   // 加密存储的 API Key
  modelName         String   // 具体模型名，如 gpt-4o
  isDefault         Boolean  @default(false)
  extraParams       Json?    // 其他参数（temperature 预设等）
  deleted           Boolean  @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([userId])
  @@index([userId, isDefault])
}

enum PluginStatus {
  INSTALLED
  RESOLVED
  STARTED
  STOPPED
  ERROR
}

// 7.3.7 创作会话与模型调用
// 上下文字段只存摘要 + 截断的消息历史（上限如最近 50 条），
// 避免长会话导致该字段无限膨胀；全文调试需求走 logs/ 日志文件
model WritingSession {
  id               String             @id @default(cuid())
  userId           String
  user             User               @relation(fields: [userId], references: [id])
  novelId          String?
  novel            Novel?             @relation(fields: [novelId], references: [id])
  sessionType      WritingSessionType
  featurePluginId  String?
  status           SessionStatus      @default(ACTIVE)
  context          Json?              // 会话上下文摘要 + 截断后的消息历史
  inputSummary     String?
  outputSummary    String?
  createdAt        DateTime           @default(now())
  endedAt          DateTime?
  modelCalls       ModelCall[]

  @@index([userId, createdAt])
}

enum WritingSessionType {
  OUTLINE_GEN
  CHAPTER_WRITE
  POLISH
  CONTINUE
  STYLE_EXTRACT
  CHARACTER_GEN
  CUSTOM
}

enum SessionStatus {
  ACTIVE
  COMPLETED
  FAILED
  CANCELLED
}

// 摘要化存储：inputExcerpt/outputExcerpt 只存前 500 字，配合 token 统计
// 保留策略：记录保留 90 天，定时任务清理（替代方案：每用户保留最近 5000 条）
// 隐私考虑：用户小说全文不进调用日志；调试全文需求走 logs/ 文件
model ModelCall {
  id            String     @id @default(cuid())
  sessionId     String
  session       WritingSession @relation(fields: [sessionId], references: [id])
  userId        String
  user          User       @relation(fields: [userId], references: [id])
  modelProvider String
  modelName     String
  inputTokens   Int        @default(0)
  outputTokens  Int        @default(0)
  inputExcerpt  String?    // 输入摘要（前 500 字，非全文）
  outputExcerpt String?    // 输出摘要（前 500 字，非全文）
  creditCost    Int        @default(0)
  status        CallStatus @default(SUCCESS)
  errorMessage  String?
  durationMs    Int?
  createdAt     DateTime   @default(now())

  @@index([sessionId])
  @@index([userId, createdAt])
}

enum CallStatus {
  SUCCESS
  FAILED
  STREAMING
  CANCELLED
}
```

---

## 8. 关键技术决策记录 (ADR)

### ADR-001：技术栈选择全栈 TypeScript

**决策**：全栈 TypeScript（Nest.js + Vue 3 + Cordis + Prisma）。

**原因**：
- Cordis 是经过验证的 TS 插件框架，省去自研插件内核的工程成本
- Node.js 生态的 LLM SDK、向量库、工具链比 Java 更丰富
- 前后端同语言，类型定义共享，开发体验一致
- JS/TS 开发者基数大，第三方写插件门槛低

**备选**：
- Java + Vue（Spring Boot + 自研插件内核）→ 团队可能更熟悉，但插件内核需自研
- 全栈 TypeScript 但不用 Cordis → 自研 TS 插件内核，失去选 TS 的核心优势

**扩展方向**：
- 如插件生态需要，前端 Cordis 可实现插件自带 UI
- 可引入 Microfrontend 架构做前端组件级插件化

---

### ADR-002：ORM 选择 Prisma

**决策**：使用 Prisma 作为 ORM。

**原因**：
- TS 生态最流行的 ORM，类型安全
- schema 即文档，迁移工具全
- 支持多数据库（SQLite / PostgreSQL），切换只需改 provider
- 查询 API 直观，无需写 SQL（复杂查询可 fallback 到 raw SQL）

**备选**：
- TypeORM → 功能全但类型安全不如 Prisma，装饰器风格过时
- Drizzle → 轻量、性能好，但生态小、文档少
- Kysely → 纯查询构建器，无 ORM 概念，学习曲线不同

**扩展方向**：
- 如需全文检索，可引入 Meilisearch 或 Elasticsearch
- 多租户场景可结合 Prisma 的 schema 多态

---

### ADR-003：数据库 MVP 使用 SQLite，预留 PostgreSQL 切换

**决策**：MVP 阶段使用 SQLite，Prisma 抽象数据访问，预留切换 PostgreSQL。

**原因**：
- MVP 目标是验证插件框架，嵌入式数据库零部署成本
- Prisma 切换数据库只需改 datasource provider，无需改代码
- SQLite 单文件数据库，用户无需安装数据库服务

**备选**：
- 直接 PostgreSQL → MVP 阶段提高使用门槛
- H2 → 不是 TS 生态原生选择

**扩展方向**：
- 产品化后提供"单机版（SQLite）/ 服务端版（PostgreSQL）"两种部署模式

---

### ADR-004：插件内核使用 Cordis

**决策**：使用 Cordis 作为插件内核，不自研。

**原因**：
- Cordis 源自 Koishi（QQ 机器人框架），经过大规模验证
- 提供完整的插件生命周期、服务注册、事件总线、可逆副作用
- 全链路类型安全（TS 声明合并）
- 省去自研插件内核的数月工程成本

**备选**：
- 自研 TS 插件内核 → 灵活但工程成本高，MVP 阶段不值得
- Nest.js 模块系统当插件用 → 不是真正的插件系统，无法动态加载卸载

**扩展方向**：
- Cordis 支持插件市场、配置层叠（patch）等高级特性，后续可直接用
- Bundle/Profile 概念可实现"插件套装"一键安装

---

### ADR-005：前端引入 Cordis（全栈插件化）

**决策**：前端也使用 Cordis，前后端通过 Bridge 插件通信。

**原因**：
- 插件可自带 UI，安装一个插件 = 功能+UI 全有
- 前后端共享类型定义和事件协议
- WebSocket 长连接，AI 流式输出天然支持
- 避免后续前端插件化返工

**备选**：
- 前端不用 Cordis（标准 Vue SPA）→ MVP 更简单，但后续插件化需改架构
- 微前端（qiankun）→ 不适合插件场景

**扩展方向**：
- MVP 阶段前端只做核心框架（UI 壳子、路由、插件管理页），功能页面逐步插件化
- Bridge 层做最小实现（服务调用代理 + 事件转发），不追求完美

---

### ADR-006：设定管理采用核心字段 + JSON 扩展混合模式

**决策**：角色、世界观设定等表，核心查询字段独立列，扩展属性放 JSON 字段。

**原因**：
- 纯字段方案：查询方便，但字段爆炸，扩展性差
- 纯 JSON 方案：极灵活，但查询麻烦，没有类型约束
- 混合模式：平衡了查询便利和扩展性，常用查询字段建索引
- 插件可以在 JSON 中扩展自己的字段，不影响核心 schema

**备选**：全字段 / 全 JSON。

**扩展方向**：JSON 字段查询需求增强时引入全文检索引擎。

---

### ADR-007：大纲存储用 JSON 树

**决策**：MVP 阶段大纲以 JSON 树形结构存在 Prisma Json 字段中，作为整体读写。

**原因**：
- MVP 阶段大纲作为整体读写（生成/保存/查看），不需要节点级操作
- 单表 JSON 方案简单、灵活，一棵树一次读写
- 分表会增加树的构建、排序、移动等复杂度
- 后续如果需要节点级操作，再分表不迟

**备选**：分表存储（parent_id 自引用 + 闭包表）。

**扩展方向**：大纲编辑器需求增强后迁移到分表 + 闭包表方案。

---

### ADR-008：插件市场 MVP 只做本地目录加载

**决策**：MVP 只实现本地插件仓库管理和目录扫描加载，远程市场预留接口。

**原因**：
- 市场服务端是独立的大工程，远超 MVP 范围
- 本地目录加载足以验证插件框架的核心能力
- 接口预留好，后续接入市场是纯增量工作

**备选**：直接做完整市场 → 范围爆炸。

**扩展方向**：市场服务端独立开发，Cordis 天然支持配置层叠（patch），后续可利用。

---

### ADR-009：模型层采用混合模式

**决策**：模型层 = 内置免费模型（核心服务+计费） + 自定义厂商模型（插件），对外统一 ModelProvider 接口。

**原因**：
- 内置免费模型与积分/VIP/计费体系强耦合，属于平台业务，不宜做成插件
- 用户自定义厂商模型是无状态调用封装，天然适合插件化
- 统一接口让上层业务（功能插件）无感切换模型来源

**备选**：全插件化 / 全内置。

**扩展方向**：内置模型可增加更多档位，插件模型可增加更多厂商适配。

---

### ADR-010：章节排序采用间隔整数 + 动态展示序号

**决策**：章节表用 `sort_order` 间隔整数（初始步长 100）排序；"第X章"展示序号由查询时 `ROW_NUMBER()` 动态生成，不落库。

**原因**：
- 整数连续序号（1,2,3...）在头部插入章节时需要全表 UPDATE 重排，500 章的场景是灾难
- 间隔 100：追加 = max + 100（顺序创作零成本），插入 = 前后两值取中点
- 展示序号动态生成，任何排序变化后序号自动连续，无重排需求
- 步长 100 vs 1000：连续插入同一位置约 6~7 次耗尽间隔（100→50→25→12→6→3→1），需要局部重排；步长 1000 可撑约 10 次，但长篇序号数值过大，观感和调试体验差。权衡后取 100，局部重排是低频操作且代价可控

**备选**：
- 连续整数 chapter_no → 插入重排灾难，排除
- 浮点排序 → 精度耗尽问题同间隔整数，且浮点比较有坑
- 链表（prevId/nextId）→ 移动 O(1) 但查询拼链复杂，MVP 不值得

**扩展方向**：间隔耗尽时局部重排（重排该小说全部章节，步长重置为 100，千章级单表操作可接受）。

---

### ADR-011：模型调用日志摘要化存储 + 保留策略

**决策**：`model_call` 表只存输入/输出各 500 字摘要（`inputExcerpt`/`outputExcerpt`）+ token 统计；记录保留 90 天，定时任务清理。

**原因**：
- 全文存储导致日志表无限膨胀（一次章节生成上下文几万字，一年几十万条记录）
- 用户小说全文进调用日志有隐私风险
- 排障需要的是"调用了什么模型、什么参数、输入输出大意"，500 字摘要足够
- 三层组合：业务限流（单次生成 ≤10 章，PRD 4.3）+ 摘要存储 + 保留期清理，分别控制单次量、单条体积、总量

**备选**：
- 全文存储 + 不清理 → 体积与隐私双输
- 只存 token 数不存文本 → 排障信息不足

**扩展方向**：保留期做成服务端配置；如需全文回放，走 logs/ 目录文件（不进数据库）。

---

### ADR-012：数据分层存储——不引入额外数据库

**决策**：正文文本存关系库 TEXT 字段；二进制资源（封面/头像/插图）MVP 存 DATA_ROOT 下的 `files/` 目录（见 6.2）、数据库存相对路径；不引入 MySQL/MinIO/Oracle 等额外数据库。

**原因**：
- 量级测算：一章 3000 字 ≈ 9KB，500 章长篇 ≈ 4.5MB，千万字超长篇 ≈ 30MB——任何关系库都毫无压力（SQLite 建议单库 <100GB）
- MySQL 与 PostgreSQL 同级，换它不改变"大文本进库"的存储模式，无收益
- Oracle 商业许可成本与项目完全不匹配，排除
- MinIO 是文件存储不是正文字段方案；MVP 单机零部署原则下引入它要多跑一个服务
- 二进制资源走文件系统 + `FileStorage` 接口抽象，未来服务端部署时换 MinIO/OSS 实现即可

**备选**：
- 正文文件化（每章一个 .md）→ 元数据与文件一致性维护成本，MVP 不值得
- 引入 MinIO 存正文 → 部署复杂度，违背零部署原则

**扩展方向**：
- 单用户正文总量 > 500MB 时启动"章节归档"功能（已完结章节转文件）
- 服务端部署时二进制资源切 MinIO/OSS，接口层已抽象
- 主库 SQLite → PostgreSQL 切换时，TOAST 机制自动优化大字段存储

---

## 9. 部署方案

### 9.1 MVP 部署（单机版）

```
用户本地机器
├── novel-agent.exe                # 可执行文件（pkg 打包的 Node.js）
└── data/                          # DATA_ROOT（单机版默认，目录布局见 6.2）
    ├── novelagent.db              # SQLite 数据库
    ├── files/                     # 二进制资源
    ├── plugins/                   # 插件目录
    │   ├── outline-generator/
    │   └── openai-model/
    ├── styles/                    # 风格包资源
    └── logs/
```

- 使用 `pkg` 或 `electron` 打包成单可执行文件
- 启动后自动打开浏览器访问 Web UI
- 所有数据存在本地

### 9.2 未来扩展（服务端部署）

- Docker 容器化部署
- PostgreSQL 数据库
- 插件市场服务端独立部署
- CDN 分发插件包

---

## 10. 待确认的技术问题

- [ ] 功能插件的标准输入输出格式（FeatureRequest/FeatureResult 详细结构）
- [ ] REST API 契约（端点定义、错误码约定、认证细节）
- [ ] 模型 provider 的标准接口（流式输出、token 统计、函数调用等）
- [ ] 前后端 Bridge 的具体实现（服务代理、事件同步、状态一致性）
- [ ] 插件配置参数 schema 的完整规范
- [ ] 插件热加载是否 MVP 必须
- [x] 用户认证方式 → 用户名密码登录（MVP 确认），Session/JWT 细节开发时定
- [ ] 内置免费模型对接哪个 API（积分定价的产品决策见 PRD 第 7 节）
- [ ] 前端项目结构划分
- [ ] 风格包 content 的 JSON schema
- [ ] pkg/Electron 打包方案选择
- [ ] 章节版本历史的表结构（MVP 不实现，实现时参考 PRD 4.1 未来扩展点）
- [ ] API Key 加密方案（model_config.apiKeyEncrypted 的具体加密实现）
