import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import {
  disconnectDb,
  getDb,
  getDbConfig,
  StylePackService,
  SessionService,
} from '@novelagent/application'
import { ensureSharedDependencies, resolvePackageDir, syncBuiltinPlugins } from '@novelagent/market-client'
import { bootstrap } from '@novelagent/web'

// 禁用 Prisma checkpoint 遥测：其缓存写入用户目录（~/AppData/Local/checkpoint-nodejs），
// 会被沙箱拦截并杀掉进程；需在任何 PrismaClient 实例化之前设置
process.env.CHECKPOINT_DISABLE = '1'

/**
 * NovelAgent 启动器（文档 3.2 apps/launcher）
 * 启动顺序：
 *   1. DATA_ROOT 初始化（config.ts 完成目录/密钥）
 *   2. 数据库迁移（prisma migrate deploy）
 *   3. 内置插件同步（packages/plugins 下各插件 dist → DATA_ROOT/plugins/）+ 共享依赖链接
 *   4. 内置风格包 seed（幂等 upsert）
 *   5. Web 服务启动（Nest bootstrap → CordisHost 加载插件 → HTTP 监听）
 *   6. 过期调用记录清理（ADR-011：90 天）
 */

/** 定位仓库根目录（dev 运行 src，prod 运行 dist） */
function findRepoRoot(): string {
  let dir = __dirname
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir
    dir = path.dirname(dir)
  }
  throw new Error('无法定位仓库根目录（pnpm-workspace.yaml）')
}

function log(msg: string): void {
  console.log(`[launcher] ${msg}`)
}

async function main(): Promise<void> {
  const repoRoot = findRepoRoot()

  // 1. 应用配置（初始化 DATA_ROOT 目录结构与密钥文件）
  const config = getDbConfig()
  process.env.DATABASE_URL = config.databaseUrl
  log(`数据目录：${config.dataRoot}`)
  log(`数据库：${config.databaseUrl}`)

  // 2. 数据库迁移（prisma CLI 的配置写入也重定向到项目内，规避受限目录）
  const prismaEnv = {
    ...process.env,
    APPDATA: path.join(repoRoot, '.appdata'),
    DATABASE_URL: config.databaseUrl,
  }
  log('执行数据库迁移（prisma migrate deploy）...')
  execSync('pnpm --filter @novelagent/application exec prisma migrate deploy', {
    cwd: repoRoot,
    env: prismaEnv,
    stdio: 'inherit',
  })

  // 3. 内置插件同步到 DATA_ROOT/plugins/（验收标准 1：扫描插件目录加载 2 个示例插件）
  const builtinDirs = fs
    .readdirSync(path.join(repoRoot, 'packages/plugins'), { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(repoRoot, 'packages/plugins', e.name, 'dist')))
    .map((e) => path.join(repoRoot, 'packages/plugins', e.name))

  const syncResult = syncBuiltinPlugins(builtinDirs, path.join(config.dataRoot, 'plugins'), log)
  log(`内置插件同步完成：更新 ${syncResult.synced.length}，未变 ${syncResult.unchanged.length}`)

  // openai-model 插件已内化为系统固定模型接入能力（model-service 厂商预设）：
  // 清理旧插件运行目录，避免 Cordis 宿主继续加载（幂等，目录不存在时跳过）
  const legacyPluginDir = path.join(config.dataRoot, 'plugins', 'openai-model')
  if (fs.existsSync(legacyPluginDir)) {
    fs.rmSync(legacyPluginDir, { recursive: true })
    log('已移除遗留插件目录 openai-model（模型接入已转为系统固定功能）')
  }

  // 插件运行时共享依赖链接（与宿主同一 cordis/core 实例，文档 6.2 node_modules 说明）
  // 注意：require.resolve 返回入口文件，需 resolvePackageDir 定位包根目录
  ensureSharedDependencies(
    config.dataRoot,
    {
      cordis: resolvePackageDir('cordis', __dirname),
      '@novelagent/core': resolvePackageDir('@novelagent/core', __dirname),
      '@novelagent/shared': resolvePackageDir('@novelagent/shared', __dirname),
    },
    log,
  )

  // 4. 内置风格包 seed（幂等；PRD 6.2：3-5 个内置风格包）
  const db = getDb()
  const stylePackService = new StylePackService(db)
  const seeded = await stylePackService.seedBuiltinPacks()
  log(`内置风格包就绪：${seeded} 个`)

  // 清理 openai-model 遗留安装记录（目录已删，插件管理列表不再显示；幂等）
  const removedLegacy = await db.installedPlugin.deleteMany({ where: { pluginId: 'openai-model' } })
  if (removedLegacy.count > 0) log(`已清理 openai-model 遗留安装记录 ${removedLegacy.count} 条`)

  // 5. 启动 Web 服务（含 Cordis 插件内核加载）
  const app = await bootstrap()

  // 6. 过期数据清理（低频维护任务，MVP 启动时执行一次）
  const sessionService = new SessionService(db)
  const cleaned = await sessionService.cleanupExpiredModelCalls()
  if (cleaned > 0) log(`已清理过期模型调用记录 ${cleaned} 条`)

  log('NovelAgent 启动完成 ✅')

  // 优雅退出：Nest 关闭（Cordis 回滚副作用）→ 断开数据库；
  // 成功退出码 0，失败记录日志并以退出码 1 退出（原 void 会吞掉 rejection，评审 L15）
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return // 防重入：信号连续触发只处理一次
    shuttingDown = true
    log(`收到 ${signal}，正在关闭...`)
    await app.close()
    await disconnectDb()
    process.exit(0)
  }
  const gracefulShutdown = (signal: string) => {
    shutdown(signal).catch((err) => {
      console.error('[launcher] 进程退出失败：', err)
      process.exit(1)
    })
  }
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))

  // 进程级兜底日志：未捕获异常按 Node 最佳实践以退出码 1 退出；未处理 Promise 拒绝仅记录不退出
  process.on('uncaughtException', (err) => {
    console.error('[launcher] 未捕获异常：', err)
    process.exit(1)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('[launcher] 未处理的 Promise 拒绝：', reason)
  })
}

main().catch((err) => {
  console.error('[launcher] 启动失败：', err)
  process.exit(1)
})
