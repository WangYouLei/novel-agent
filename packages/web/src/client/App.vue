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

        <el-menu :default-active="activeMenu" router class="side-menu">
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
          <el-menu-item index="/market">
            <el-icon><ShoppingCart /></el-icon>
            <span>插件市场</span>
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
import { Coin, ArrowDown, Notebook, MagicStick, Grid, Cpu, Brush, ShoppingCart } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import type { CreditLogDto } from '@novelagent/shared'
import { CREDIT_POLICY } from '@novelagent/shared'

const DAILY_AMOUNT = CREDIT_POLICY.DAILY_CLAIM_AMOUNT

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const logs = ref<CreditLogDto[]>([])
const claiming = ref(false)

const pageTitle = computed(() => {
  if (route.path.startsWith('/novels/')) return '小说编辑'
  return (
    ({
      '/novels': '我的小说',
      '/styles': '风格包',
      '/outline': '大纲生成',
      '/plugins': '插件管理',
      '/market': '插件市场',
      '/models': '模型设置',
    }) as Record<string, string>
  )[route.path] ?? ''
})

// 小说编辑页（/novels/:id）保持"小说管理"菜单高亮
const activeMenu = computed(() => (route.path.startsWith('/novels') ? '/novels' : route.path))

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

/* ===== 侧边栏：柠檬黄大色块 ===== */
.app-aside {
  background: var(--accent);
  color: #111111;
  display: flex;
  flex-direction: column;
  border-right: var(--nb-border);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 22px 20px 4px;
  cursor: pointer;
}
.brand-mark {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: #111111;
  background: #ffffff;
  border: var(--nb-border);
  border-radius: 10px;
  box-shadow: 3px 3px 0 #111111;
  transform: rotate(-6deg);
}
.brand-name {
  font-size: 19px;
  font-weight: 900;
  color: #111111;
  letter-spacing: -0.01em;
}
.brand-sub {
  padding: 6px 20px 18px;
  font-size: 12px;
  color: rgba(17, 17, 17, 0.62);
  font-weight: 600;
  letter-spacing: 0.16em;
  border-bottom: var(--nb-border);
}
.aside-foot {
  margin-top: auto;
  padding: 16px 20px;
  font-size: 12px;
  color: rgba(17, 17, 17, 0.62);
  font-weight: 600;
  letter-spacing: 0.2em;
  border-top: var(--nb-border);
  text-align: center;
}

/* 黄底菜单覆写 */
.side-menu {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #111111;
  --el-menu-hover-bg-color: rgba(17, 17, 17, 0.08);
  --el-menu-active-color: #111111;
  --el-menu-item-height: 48px;
  border-right: none;
  padding: 12px 10px 0;
}
.side-menu .el-menu-item {
  border-radius: 10px;
  margin-bottom: 6px;
  font-weight: 600;
}
.side-menu .el-menu-item.is-active {
  background: #ffffff;
  border: var(--nb-border);
  box-shadow: 3px 3px 0 #111111;
  color: #111111;
  font-weight: 800;
}

/* ===== 顶栏：奶油底 + 墨黑粗下边 ===== */
.app-header {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--paper-bg);
  border-bottom: var(--nb-border);
  padding: 0 24px;
}
.page-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--ink-strong);
  background: linear-gradient(transparent 58%, var(--accent) 58%);
  padding: 0 6px;
}
.spacer {
  flex: 1;
}
.credit-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #ffffff;
  color: #111111;
  border: var(--nb-border);
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 3px 3px 0 #111111;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.credit-chip:hover {
  transform: translate(-1px, -1px);
  box-shadow: 4px 4px 0 #111111;
}
.credit-chip .el-icon {
  color: var(--accent-deep);
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
  background: var(--gold);
  color: #111111;
  border: 2px solid #111111;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
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

/* ===== 主区：奶油底 + 圆点网格纹理 ===== */
.app-main {
  background: transparent;
  background-image: radial-gradient(rgba(17, 17, 17, 0.07) 1.2px, transparent 1.2px);
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
