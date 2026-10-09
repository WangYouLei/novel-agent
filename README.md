# NovelAgent

[English](./README.en.md) | 简体中文

NovelAgent 是一个**可插拔的 AI 小说创作平台**。核心创作能力由一个个独立的功能插件提供，你可以像搭积木一样选择、组合、扩展创作能力。

## 核心特性

- **可插拔架构**：创作能力以插件形式存在，独立安装、卸载、启用、禁用，插件之间可声明依赖关系
- **风格个性化**：内置风格包 / 用户生成风格包 / 第三方风格包三级供给体系，一本小说一个主体风格包
- **创作全流程**：从创意萌芽、世界观设定、角色塑造、大纲规划到逐章写作，全链路覆盖
- **双模型接入**：内置免费模型（积分计费）+ 用户自定义模型（自带 API Key，如 OpenAI、Claude、本地模型）
- **低门槛 + 高上限**：新手开箱即用，高手可自定义模型、风格与开发自己的功能插件

## 技术栈

| 层面 | 选型 |
|------|------|
| 语言 | TypeScript 5.x（全栈统一） |
| 包管理 | pnpm + monorepo |
| 后端框架 | Nest.js |
| 插件内核 | Cordis（源自 Koishi 的插件元框架，前后端各运行一个 Context，经 WebSocket 桥接） |
| ORM / 数据库 | Prisma + SQLite（MVP，预留切换 PostgreSQL） |
| 前端 | Vue 3 + Element Plus + Pinia |
| 实时通信 | Socket.IO（流式输出、事件桥接） |
| 构建 | Vite（前端）+ tsup（库/后端） |
| 规范与测试 | ESLint + Prettier + Vitest |

## 仓库结构

```
novel-agent/
├── apps/
│   └── launcher/            # 应用启动器
└── packages/
    ├── core/                # 插件内核（Cordis 封装、扩展点、事件、服务声明）
    ├── shared/              # 共享类型与工具库
    ├── application/         # 业务服务层（小说、写作、大纲、风格包、计费、用户）
    ├── model-service/       # 模型服务（内置模型接入、风格分析）
    ├── market-client/       # 插件市场客户端（本地仓库、安装器）
    ├── web/                 # Web 端（Nest.js 服务端 + Vue 3 客户端）
    └── plugins/             # 官方插件（openai-model、outline-generator、style-generator）
```

## 快速开始

环境要求：Node.js >= 18.18，pnpm

```bash
# 安装依赖
pnpm install

# 构建所有包
pnpm build

# 启动开发
pnpm dev

# 数据库迁移
pnpm db:migrate
```

## License

仅供学习交流使用。
