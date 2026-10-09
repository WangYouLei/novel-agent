<template>
  <div class="page">
    <div class="page-header">
      <h2>插件管理</h2>
      <span class="hint">启用 / 禁用 / 配置插件，状态实时刷新</span>
    </div>

    <el-alert
      v-for="plugin in plugins.filter((p) => p.runtimeStatus === 'DEPENDENCY_MISSING')"
      :key="plugin.pluginId"
      :title="`【${plugin.displayName}】依赖缺失：${plugin.missingDependencies.join('、')} —— 功能不可用`"
      type="warning"
      show-icon
      :closable="false"
      class="dep-alert"
    />

    <el-row :gutter="16">
      <el-col v-for="plugin in plugins" :key="plugin.id" :xs="24" :md="12">
        <el-card class="plugin-card" shadow="hover">
          <div class="plugin-head">
            <div>
              <span class="plugin-name">{{ plugin.displayName }}</span>
              <el-tag size="small" type="info" class="ml8">v{{ plugin.version }}</el-tag>
              <el-tag size="small" :type="typeTagType(plugin.type)" class="ml8">
                {{ typeName(plugin.type) }}
              </el-tag>
            </div>
            <el-switch
              :model-value="plugin.enabled"
              :loading="toggling === plugin.pluginId"
              @change="(val: any) => toggle(plugin, !!val)"
            />
          </div>

          <p class="plugin-desc">{{ plugin.description }}</p>

          <div class="plugin-foot">
            <el-tag size="small" :type="statusTagType(plugin.runtimeStatus)">
              {{ statusName(plugin.runtimeStatus) }}
            </el-tag>
            <span class="author">{{ plugin.author ?? 'unknown' }} · 来源：{{ sourceName(plugin.source) }}</span>
            <el-button
              v-if="plugin.configSchema.length"
              size="small"
              @click="openConfig(plugin)"
            >
              配置
            </el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 插件配置对话框（schema 驱动动态表单，验收标准 3） -->
    <el-dialog v-model="configDialog.visible" :title="`配置 - ${configDialog.pluginName}`" width="440px">
      <div class="config-form">
        <template v-for="field in configDialog.schema" :key="field.key">
          <div v-if="field.type === 'number'" class="config-row">
            <span>{{ field.name }}</span>
            <el-input-number
              v-model="configDialog.values[field.key]"
              :min="field.min"
              :max="field.max"
            />
          </div>
          <div v-else-if="field.type === 'select' || field.enum" class="config-row">
            <span>{{ field.name }}</span>
            <el-select v-model="configDialog.values[field.key]" style="width: 140px">
              <el-option v-for="opt in field.enum" :key="opt" :label="opt" :value="opt" />
            </el-select>
          </div>
          <div v-else-if="field.type === 'boolean'" class="config-row">
            <span>{{ field.name }}</span>
            <el-switch v-model="configDialog.values[field.key]" />
          </div>
          <div v-else class="config-row">
            <span>{{ field.name }}</span>
            <el-input v-model="configDialog.values[field.key]" style="width: 200px" />
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="configDialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="savingConfig" @click="saveConfig">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { inject, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { get, post, put } from '@/api/http'
import type { PluginConfigField, PluginDto } from '@novelagent/shared'
import type { Context } from 'cordis'
import type { PluginStatusChangedEvent } from '@novelagent/shared'

const plugins = ref<PluginDto[]>([])
const toggling = ref('')
const savingConfig = ref(false)
const bridgeCtx = inject<Context>('bridge')

const configDialog = reactive({
  visible: false,
  pluginId: '',
  pluginName: '',
  schema: [] as PluginConfigField[],
  values: {} as Record<string, unknown>,
})

let offEvent: (() => void) | undefined

onMounted(async () => {
  await load()
  // Bridge 事件：插件状态变化实时刷新（验收标准 2）
  if (bridgeCtx) {
    offEvent = bridgeCtx.on('plugin-status-changed', (_data: PluginStatusChangedEvent) => {
      load().catch(() => undefined)
    })
  }
})

onUnmounted(() => offEvent?.())

async function load() {
  plugins.value = await get<PluginDto[]>('/api/plugins')
}

async function toggle(plugin: PluginDto, enabled: boolean) {
  toggling.value = plugin.pluginId
  try {
    await post(`/api/plugins/${plugin.pluginId}/${enabled ? 'enable' : 'disable'}`)
    ElMessage.success(`${plugin.displayName} 已${enabled ? '启用' : '禁用'}`)
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    toggling.value = ''
  }
}

function openConfig(plugin: PluginDto) {
  configDialog.pluginId = plugin.pluginId
  configDialog.pluginName = plugin.displayName
  configDialog.schema = plugin.configSchema
  configDialog.values = { ...plugin.config }
  configDialog.visible = true
}

async function saveConfig() {
  savingConfig.value = true
  try {
    await put(`/api/plugins/${configDialog.pluginId}/config`, { config: configDialog.values })
    ElMessage.success('配置已保存')
    configDialog.visible = false
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    savingConfig.value = false
  }
}

function typeName(type: string): string {
  return { FEATURE: '功能插件', MODEL: '模型插件', STYLE_GENERATOR: '风格生成' }[type] ?? type
}
function typeTagType(type: string): string {
  return { FEATURE: 'primary', MODEL: 'success', STYLE_GENERATOR: 'warning' }[type] ?? 'info'
}
function statusName(status: string): string {
  return {
    STARTED: '运行中',
    STOPPED: '已禁用',
    ERROR: '加载失败',
    DEPENDENCY_MISSING: '依赖缺失',
  }[status] ?? status
}
function statusTagType(status: string): string {
  return {
    STARTED: 'success',
    STOPPED: 'info',
    ERROR: 'danger',
    DEPENDENCY_MISSING: 'warning',
  }[status] ?? 'info'
}
function sourceName(source: string): string {
  return { BUILTIN: '内置', LOCAL: '本地', MARKETPLACE: '市场' }[source] ?? source
}
</script>

<style scoped>
.dep-alert {
  margin-bottom: 14px;
  border-radius: 8px;
}
.plugin-card {
  margin-bottom: 18px;
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
.plugin-name {
  font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif;
  font-weight: 700;
  font-size: 16px;
  color: var(--ink-strong);
}
.plugin-desc {
  color: var(--ink-regular);
  font-size: 13px;
  line-height: 1.7;
  min-height: 40px;
  margin: 12px 0;
}
.plugin-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--line-soft);
}
.author {
  color: var(--ink-secondary);
  font-size: 12px;
  flex: 1;
}
.config-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ml8 {
  margin-left: 8px;
}
</style>
