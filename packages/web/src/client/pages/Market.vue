<template>
  <div class="page">
    <div class="page-header">
      <h2>插件市场</h2>
      <div class="header-actions">
        <el-tag v-if="status" :type="status.available ? 'success' : 'info'" size="large" class="status-tag">
          {{ status.available ? '市场在线' : '市场离线' }}
        </el-tag>
        <!-- 本地 zip 安装（第三方插件不经市场直接分发） -->
        <input ref="zipInput" type="file" accept=".zip" class="hidden-input" @change="onZipSelected" />
        <el-button :loading="uploading" @click="($refs.zipInput as HTMLInputElement).click()">
          安装本地插件
        </el-button>
        <el-button @click="refreshAll">
          刷新
        </el-button>
      </div>
    </div>

    <!-- 市场离线提示：引导启动独立市场服务 -->
    <el-alert
      v-if="status && !status.available"
      :title="`插件市场服务未启动（${status.baseUrl}）。请先运行 pnpm market:dev 启动市场服务；也可直接使用「安装本地插件」上传 zip。`"
      type="warning"
      show-icon
      :closable="false"
      class="mb16"
    />

    <!-- 搜索工具栏 -->
    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索插件名称 / 标识 / 描述"
        clearable
        class="search-input"
        @keyup.enter="onSearch"
        @clear="onSearch"
      >
        <template #append>
          <el-button @click="onSearch">搜索</el-button>
        </template>
      </el-input>
      <el-select v-model="category" placeholder="全部分类" clearable class="category-select" @change="onSearch">
        <el-option v-for="c in categories" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
    </div>

    <!-- 插件卡片 -->
    <el-empty v-if="status?.available && plugins.length === 0" description="市场暂无匹配插件" />
    <el-row v-else :gutter="16">
      <el-col v-for="plugin in plugins" :key="plugin.pluginId" :xs="24" :md="12" :xl="8">
        <el-card class="plugin-card" shadow="hover">
          <div class="plugin-head">
            <div class="plugin-title">
              <span class="plugin-name">{{ plugin.displayName }}</span>
              <el-tag size="small" type="info" class="ml8">v{{ plugin.version }}</el-tag>
              <el-tag size="small" :type="typeTagType(plugin.type)" class="ml8">
                {{ typeName(plugin.type) }}
              </el-tag>
            </div>
            <span class="downloads">{{ plugin.downloads }} 次下载</span>
          </div>

          <p class="plugin-desc">{{ plugin.description ?? '暂无描述' }}</p>

          <div class="plugin-foot">
            <span class="author">{{ plugin.author ?? 'unknown' }} · {{ plugin.pluginId }}</span>
            <div class="actions">
              <el-button size="small" @click="openDetail(plugin.pluginId)">详情</el-button>
              <el-button
                v-if="installedVersion(plugin.pluginId) === plugin.version"
                size="small"
                type="success"
                plain
                disabled
              >
                已安装
              </el-button>
              <el-button
                v-else-if="installedVersion(plugin.pluginId)"
                size="small"
                type="warning"
                :loading="installing === plugin.pluginId"
                @click="install(plugin.pluginId)"
              >
                更新
              </el-button>
              <el-button
                v-else
                size="small"
                type="primary"
                :loading="installing === plugin.pluginId"
                @click="install(plugin.pluginId)"
              >
                安装
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-pagination
      v-if="total > pageSize"
      v-model:current-page="page"
      :page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      class="pager"
      @current-change="loadPlugins"
    />

    <!-- 插件详情对话框 -->
    <el-dialog v-model="detail.visible" :title="detail.data?.displayName ?? '插件详情'" width="560px">
      <template v-if="detail.data">
        <el-descriptions :column="2" size="small" border>
          <el-descriptions-item label="标识">{{ detail.data.pluginId }}</el-descriptions-item>
          <el-descriptions-item label="最新版本">v{{ detail.data.version }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeName(detail.data.type) }}</el-descriptions-item>
          <el-descriptions-item label="作者">{{ detail.data.author ?? 'unknown' }}</el-descriptions-item>
        </el-descriptions>

        <p class="detail-desc">{{ detail.data.description ?? '暂无描述' }}</p>

        <h4 class="section-title">依赖</h4>
        <p v-if="Object.keys(detail.data.dependencies ?? {}).length === 0" class="muted">无</p>
        <el-tag v-for="(range, dep) in detail.data.dependencies" :key="dep" size="small" class="dep-tag">
          {{ dep }}@{{ range }}
        </el-tag>

        <h4 class="section-title">配置项（{{ detail.data.configSchema?.length ?? 0 }}）</h4>
        <p v-if="!detail.data.configSchema?.length" class="muted">无配置项</p>
        <el-tag v-for="field in detail.data.configSchema" :key="field.key" size="small" type="info" class="dep-tag">
          {{ field.name }}（{{ field.key }}）
        </el-tag>

        <h4 class="section-title">版本历史</h4>
        <el-table :data="detail.versions" size="small" max-height="220">
          <el-table-column prop="version" label="版本" width="110" />
          <el-table-column prop="changelog" label="说明" min-width="140" />
          <el-table-column label="发布时间" width="170">
            <template #default="{ row }">{{ formatTime(row.publishedAt) }}</template>
          </el-table-column>
          <el-table-column width="90">
            <template #default="{ row }">
              <el-button
                size="small"
                link
                type="primary"
                :disabled="installedVersion(detail.data!.pluginId) === row.version"
                @click="install(detail.data!.pluginId, row.version)"
              >
                {{ installedVersion(detail.data!.pluginId) === row.version ? '已装' : '安装' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { get, post, postForm } from '@/api/http'
import type {
  MarketCategoryDto,
  MarketPluginDetailDto,
  MarketPluginDto,
  MarketPluginVersionDto,
  MarketStatusDto,
  PluginDto,
  PluginInstallResultDto,
} from '@novelagent/shared'

/**
 * 插件市场页（PRD 插件市场：浏览/搜索/安装/更新）：
 * - 数据源为独立市场服务（离线时提示启动），安装经服务端下载→落盘→热重载
 * - 本地 zip 安装为补充入口（第三方插件不经市场分发）
 */
const pageSize = 12
const status = ref<MarketStatusDto | null>(null)
const categories = ref<MarketCategoryDto[]>([])
const plugins = ref<MarketPluginDto[]>([])
const total = ref(0)
const page = ref(1)
const keyword = ref('')
const category = ref('')

/** 已安装插件 pluginId → 本地版本（判定 已安装/可更新） */
const installed = ref<Record<string, string>>({})
const installing = ref('')
const uploading = ref(false)
const zipInput = ref<HTMLInputElement>()

const detail = reactive({
  visible: false,
  data: null as MarketPluginDetailDto | null,
  versions: [] as MarketPluginVersionDto[],
})

onMounted(refreshAll)

async function refreshAll() {
  await Promise.all([loadStatus(), loadInstalled()])
  if (status.value?.available) await Promise.all([loadCategories(), loadPlugins()])
}

async function loadStatus() {
  try {
    status.value = await get<MarketStatusDto>('/api/market/status')
  } catch {
    status.value = { available: false, baseUrl: '' }
  }
}

async function loadCategories() {
  try {
    categories.value = await get<MarketCategoryDto[]>('/api/market/categories')
  } catch {
    categories.value = []
  }
}

async function loadPlugins() {
  if (!status.value?.available) return
  const params = new URLSearchParams({
    keyword: keyword.value,
    page: String(page.value),
    size: String(pageSize),
  })
  if (category.value) params.set('category', category.value)
  const result = await get<{ items: MarketPluginDto[]; total: number }>(`/api/market/plugins?${params}`)
  plugins.value = result.items
  total.value = result.total
}

async function loadInstalled() {
  try {
    const list = await get<PluginDto[]>('/api/plugins')
    installed.value = Object.fromEntries(list.map((p) => [p.pluginId, p.version]))
  } catch {
    installed.value = {}
  }
}

function installedVersion(pluginId: string): string | undefined {
  return installed.value[pluginId]
}

function onSearch() {
  page.value = 1
  loadPlugins().catch((err) => ElMessage.error((err as Error).message))
}

/** 从市场安装/更新（缺省最新版本），成功后刷新本地安装态 */
async function install(pluginId: string, version?: string) {
  installing.value = pluginId
  try {
    const result = await post<PluginInstallResultDto>('/api/market/install', { pluginId, version })
    ElMessage.success(
      result.runtimeStatus === 'STARTED'
        ? `${result.displayName} v${result.version} 安装成功，已在运行`
        : `${result.displayName} v${result.version} 已安装（当前状态：${result.runtimeStatus}）`,
    )
    await Promise.all([loadInstalled(), loadPlugins()])
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    installing.value = ''
  }
}

/** 本地 zip 上传安装 */
async function onZipSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选择同一文件
  if (!file) return
  uploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    const result = await postForm<PluginInstallResultDto>('/api/plugins/install-local', form)
    ElMessage.success(`${result.displayName} v${result.version} 安装成功（状态：${result.runtimeStatus}）`)
    await loadInstalled()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    uploading.value = false
  }
}

async function openDetail(pluginId: string) {
  try {
    const [data, versions] = await Promise.all([
      get<MarketPluginDetailDto>(`/api/market/plugins/${pluginId}`),
      get<MarketPluginVersionDto[]>(`/api/market/plugins/${pluginId}/versions`),
    ])
    detail.data = data
    detail.versions = versions
    detail.visible = true
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

function typeName(type: string): string {
  return { FEATURE: '功能插件', MODEL: '模型插件', STYLE_GENERATOR: '风格生成' }[type] ?? type
}
function typeTagType(type: string): string {
  return { FEATURE: 'primary', MODEL: 'success', STYLE_GENERATOR: 'warning' }[type] ?? 'info'
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}
</script>

<style scoped>
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-tag {
  border-radius: 999px;
}
.hidden-input {
  display: none;
}
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 18px;
}
.search-input {
  max-width: 360px;
}
.category-select {
  width: 160px;
}
.plugin-card {
  margin-bottom: 16px;
  border-radius: 12px;
}
.plugin-card :deep(.el-card__body) {
  padding: 18px 20px;
}
.plugin-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.plugin-title {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 0;
}
.plugin-name {
  font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif;
  font-weight: 700;
  font-size: 16px;
  color: var(--ink-strong);
}
.downloads {
  color: var(--ink-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.plugin-desc {
  color: var(--ink-regular);
  font-size: 13px;
  line-height: 1.7;
  min-height: 44px;
  margin: 12px 0;
}
.plugin-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--line-soft);
}
.author {
  color: var(--ink-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.pager {
  margin-top: 8px;
  justify-content: center;
}
.detail-desc {
  color: var(--ink-regular);
  font-size: 13px;
  line-height: 1.7;
  margin: 14px 0 4px;
}
.section-title {
  margin: 16px 0 8px;
  color: var(--ink-strong);
  font-size: 14px;
}
.dep-tag {
  margin: 0 6px 6px 0;
}
.muted {
  color: var(--ink-secondary);
  font-size: 13px;
}
.mb16 {
  margin-bottom: 16px;
  border-radius: 8px;
}
.ml8 {
  margin-left: 8px;
}
</style>
