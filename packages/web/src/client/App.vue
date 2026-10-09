<template>
  <el-container class="app-shell">
    <el-container class="app-body">
      <!-- 侧边菜单（登录后显示）：深棕底 + 米色文字 -->
      <el-aside v-if="auth.isLoggedIn" width="220px" class="app-aside">
        <div class="brand serif" @click="$router.push('/novels')">
          <span class="brand-mark">✒</span>
          <span class="brand-name">NovelAgent</span>
        </div>
        <div class="brand-sub">AI 小说创作工坊</div>

        <el-menu :default-active="$route.path" router class="side-menu">
          <el-menu-item index="/chat">
            <el-icon><ChatDotRound /></el-icon>
            <span>AI 对话</span>
          </el-menu-item>
          <el-menu-item index="/novels">
            <el-icon><Notebook /></el-icon>
            <span>小说管理</span>
          </el-menu-item>
          <el-menu-item index="/styles">
            <el-icon><Brush /></el-icon>
            <span>风格包</span>
          </el-menu-item>
          <el-menu-item index="/outline">
            <el-icon><MagicStick /></el-icon>
            <span>大纲生成</span>
          </el-menu-item>
          <el-menu-item index="/plugins">
            <el-icon><Grid /></el-icon>
            <span>插件管理</span>
          </el-menu-item>
          <el-menu-item index="/models">
            <el-icon><Cpu /></el-icon>
            <span>模型设置</span>
          </el-menu-item>
        </el-menu>

        <div class="aside-foot">落笔成章 · 字句生花</div>
      </el-aside>

      <el-container class="app-right">
        <!-- 顶栏：积分 / 用户菜单 -->
        <el-header v-if="auth.isLoggedIn" class="app-header" height="60px">
          <div class="page-title serif">{{ pageTitle }}</div>
          <div class="spacer" />
          <el-popover placement="bottom" :width="360" trigger="click" @show="loadLogs">
            <template #reference>
              <button class="credit-chip" type="button">
                <el-icon><Coin /></el-icon>
                <span class="credit-num">{{ auth.user?.credits ?? '-' }}</span>
                <span class="credit-label">积分</span>
              </button>
            </template>
            <div class="credit-panel">
              <el-button type="primary" size="small" :loading="claiming" @click="claim">
                每日领取 +{{ DAILY_AMOUNT }}
              </el-button>
              <el-table v-if="logs.length" :data="logs" size="small" max-height="300">
                <el-table-column prop="description" label="说明" min-width="120" />
                <el-table-column label="变动" width="80">
                  <template #default="{ row }">
                    <span :class="row.amount >= 0 ? 'gain' : 'cost'">
                      {{ row.amount >= 0 ? '+' : '' }}{{ row.amount }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="时间" width="150">
                  <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-popover>
          <el-dropdown @command="onCommand">
            <span class="user-chip">
              <span class="avatar">{{ auth.user?.username?.charAt(0)?.toUpperCase() ?? '·' }}</span>
              <span class="username">{{ auth.user?.username ?? '未登录' }}</span>
              <el-icon class="caret"><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-header>

        <el-main class="app-main">
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Coin, ArrowDown, ChatDotRound, Notebook, MagicStick, Grid, Cpu, Brush } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import type { CreditLogDto } from '@novelagent/shared'
import { CREDIT_POLICY } from '@novelagent/shared'

const DAILY_AMOUNT = CREDIT_POLICY.DAILY_CLAIM_AMOUNT

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const logs = ref<CreditLogDto[]>([])
const claiming = ref(false)

const pageTitle = computed(
  () =>
    ({
      '/chat': 'AI 对话',
      '/novels': '我的小说',
      '/styles': '风格包',
      '/outline': '大纲生成',
      '/plugins': '插件管理',
      '/models': '模型设置',
    })[route.path] ?? '',
)

onMounted(() => {
  if (auth.isLoggedIn && !auth.user) {
    auth.fetchMe().catch(() => auth.logout())
  }
})

async function loadLogs() {
  try {
    logs.value = await auth.loadCreditLogs()
  } catch (err) {
    console.warn('积分流水加载失败', err)
  }
}

async function claim() {
  claiming.value = true
  try {
    const result = await auth.claimDaily()
    ElMessage.success(`领取成功，当前积分 ${result.credits}`)
  } catch (err) {
    ElMessage.warning((err as Error).message)
  } finally {
    claiming.value = false
  }
}

function onCommand(command: string) {
  if (command === 'logout') {
    auth.logout()
    router.push('/login')
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
.app-shell {
  height: 100%;
}
.app-body {
  height: 100%;
}
.app-right {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* ===== 侧边栏：深棕底 ===== */
.app-aside {
  background: linear-gradient(180deg, #38291d 0%, #2c2016 100%);
  color: #e9dfc9;
  display: flex;
  flex-direction: column;
  border-right: none;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 22px 20px 4px;
  cursor: pointer;
}
.brand-mark {
  font-size: 22px;
  color: var(--gold);
}
.brand-name {
  font-size: 20px;
  font-weight: 700;
  color: #f5ecd7;
  letter-spacing: 0.04em;
}
.brand-sub {
  padding: 0 20px 18px;
  font-size: 12px;
  color: #a3937a;
  letter-spacing: 0.16em;
  border-bottom: 1px solid rgba(233, 223, 201, 0.12);
}
.aside-foot {
  margin-top: auto;
  padding: 16px 20px;
  font-size: 12px;
  color: #87755c;
  letter-spacing: 0.2em;
  border-top: 1px solid rgba(233, 223, 201, 0.1);
  text-align: center;
}

/* 深色菜单覆写 */
.side-menu {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #cbb996;
  --el-menu-hover-bg-color: rgba(233, 223, 201, 0.08);
  --el-menu-active-color: #f0d9a8;
  --el-menu-item-height: 48px;
  border-right: none;
  padding: 12px 10px 0;
}
.side-menu .el-menu-item {
  border-radius: 8px;
  margin-bottom: 4px;
}
.side-menu .el-menu-item.is-active {
  background: linear-gradient(90deg, rgba(201, 160, 99, 0.25), rgba(201, 160, 99, 0.1));
  color: #f0d9a8;
  font-weight: 600;
}

/* ===== 顶栏 ===== */
.app-header {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--card-bg);
  border-bottom: 1px solid var(--line-soft);
  padding: 0 24px;
}
.page-title {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink-strong);
}
.spacer {
  flex: 1;
}
.credit-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-soft);
  color: var(--accent-deep);
  border: 1px solid #e2cba4;
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.credit-chip:hover {
  background: #efdfc3;
}
.credit-num {
  font-weight: 700;
  font-size: 14px;
}
.credit-label {
  color: var(--ink-secondary);
}
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 8px;
  transition: background 0.2s;
}
.user-chip:hover {
  background: var(--el-fill-color-light);
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent), var(--gold));
  color: #fffdf7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
}
.username {
  color: var(--ink-strong);
  font-weight: 500;
}
.caret {
  color: var(--ink-secondary);
  font-size: 12px;
}

/* ===== 主区 ===== */
.app-main {
  background: var(--paper-bg);
  background-image: radial-gradient(rgba(169, 113, 63, 0.04) 1px, transparent 1px);
  background-size: 22px 22px;
  padding: 24px 28px;
  overflow-y: auto;
}
.gain {
  color: var(--el-color-success);
}
.cost {
  color: var(--el-color-danger);
}
.credit-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ===== 通用页面头 ===== */
.page {
  max-width: 1280px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  gap: 12px;
  flex-wrap: wrap;
}
.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--ink-strong);
}
.page-header .hint {
  color: var(--ink-secondary);
  font-size: 13px;
}
</style>
