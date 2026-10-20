<template>
  <div class="page">
    <div class="page-header">
      <h2>我的小说</h2>
      <el-button type="primary" @click="openCreate">创建小说</el-button>
    </div>

    <el-empty v-if="!loading && novels.length === 0" description="还没有小说，点击右上角创建" />

    <el-row :gutter="16">
      <el-col v-for="novel in novels" :key="novel.id" :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="novel-card" shadow="hover" @click="gotoEdit(novel)">
          <div class="novel-title">{{ novel.title }}</div>
          <div class="novel-meta">
            <el-tag size="small" :type="statusType(novel.status)">{{ statusName(novel.status) }}</el-tag>
            <el-tag v-if="novel.genre" size="small" type="info">{{ novel.genre }}</el-tag>
          </div>
          <div class="novel-style">
            风格包：
            <el-tag size="small" effect="plain">{{ novel.stylePackName ?? '默认' }}</el-tag>
          </div>
          <p class="novel-desc">{{ novel.description || '暂无简介' }}</p>
          <div class="novel-actions">
            <el-button size="small" type="primary" plain @click.stop="gotoEdit(novel)">编辑创作</el-button>
            <el-button size="small" @click.stop="openOutline(novel)">生成大纲</el-button>
            <el-button size="small" type="danger" plain @click.stop="remove(novel)">删除</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 创建小说对话框（编辑在小说编辑页进行） -->
    <el-dialog v-model="dialog.visible" title="创建小说" width="480px">
      <el-form :model="dialog.form" label-width="90px">
        <el-form-item label="标题" required>
          <el-input v-model="dialog.form.title" maxlength="50" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="dialog.form.genre" placeholder="选择类型" clearable style="width: 100%">
            <el-option v-for="g in genres" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="主体风格包">
          <el-select
            v-model="dialog.form.stylePackId"
            placeholder="不选则由插件使用兜底风格"
            clearable
            style="width: 100%"
          >
            <el-option-group
              v-for="group in stylePackGroups"
              :key="group.label"
              :label="group.label"
            >
              <el-option
                v-for="pack in group.options"
                :key="pack.id"
                :label="pack.name"
                :value="pack.id"
              />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="dialog.form.description" type="textarea" :rows="3" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 大纲生成对话框（原独立页并入小说管理） -->
    <el-dialog
      v-model="outline.visible"
      :title="`生成大纲 · 《${outline.novel?.title ?? ''}》`"
      width="720px"
      :close-on-click-modal="!outline.generating"
      :close-on-press-escape="!outline.generating"
    >
      <el-form v-if="outline.novel" label-position="top" @submit.prevent>
        <el-form-item label="一句话创意" required>
          <el-input
            v-model="outline.idea"
            type="textarea"
            :rows="3"
            maxlength="2000"
            show-word-limit
            :disabled="outline.generating"
            placeholder="例如：废柴少年捡到一枚会说话的戒指，从此走上逆袭之路"
          />
        </el-form-item>

        <el-form-item label="模型选择">
          <ModelPicker v-model="outline.model" :disabled="outline.generating" />
        </el-form-item>

        <!-- 插件参数（schema 动态渲染，验收标准 3） -->
        <el-form-item v-if="pluginSchema.length" label="插件参数">
          <div class="plugin-config">
            <template v-for="field in pluginSchema" :key="field.key">
              <div v-if="field.type === 'number'" class="field-row">
                <span class="field-name">{{ field.name }}（{{ field.min }}-{{ field.max }}）</span>
                <el-input-number
                  v-model="pluginConfig[field.key]"
                  :min="field.min"
                  :max="field.max"
                  size="small"
                />
              </div>
              <div v-else-if="field.type === 'select' || field.enum" class="field-row">
                <span class="field-name">{{ field.name }}</span>
                <el-select v-model="pluginConfig[field.key]" size="small" style="width: 120px">
                  <el-option v-for="opt in field.enum" :key="opt" :label="opt" :value="opt" />
                </el-select>
              </div>
              <div v-else-if="field.type === 'boolean'" class="field-row">
                <span class="field-name">{{ field.name }}</span>
                <el-switch v-model="pluginConfig[field.key]" />
              </div>
            </template>
          </div>
        </el-form-item>

        <el-button
          type="primary"
          class="generate-btn"
          :loading="outline.generating"
          :disabled="!canGenerate"
          @click="generateOutline"
        >
          {{ outline.generating ? `生成中 ${outline.progress}%` : '生成大纲' }}
        </el-button>
        <el-progress
          v-if="outline.generating"
          :percentage="outline.progress"
          :stroke-width="8"
          :format="() => outline.progressMessage"
        />
      </el-form>

      <!-- 结果预览与保存 -->
      <template v-if="outline.result">
        <el-divider />
        <div class="result-header">
          <span class="result-title">{{ outline.result.outline.title }}</span>
          <div>
            <el-tag size="small" type="info">
              {{ outline.result.modelCall.modelProvider }} / {{ outline.result.modelCall.modelName }}
            </el-tag>
            <el-tag v-if="outline.result.modelCall.creditCost > 0" size="small" type="warning" class="ml8">
              -{{ outline.result.modelCall.creditCost }} 积分
            </el-tag>
            <el-tag size="small" class="ml8">
              tokens: {{ outline.result.modelCall.inputTokens }}入/{{ outline.result.modelCall.outputTokens }}出
            </el-tag>
            <el-button size="small" type="primary" :loading="outline.saving" class="ml8" @click="saveOutline">
              保存到小说
            </el-button>
          </div>
        </div>
        <p class="logline">{{ outline.result.outline.logline }}</p>
        <p class="theme">主题：{{ outline.result.outline.theme }}</p>
        <el-collapse>
          <el-collapse-item
            v-for="chapter in outline.result.outline.chapters"
            :key="chapter.no"
            :title="chapter.title"
          >
            <div>{{ chapter.summary }}</div>
          </el-collapse-item>
        </el-collapse>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { del, get, post } from '@/api/http'
import ModelPicker, { type ModelSelectionValue } from '@/components/ModelPicker.vue'
import type {
  GenerateOutlineResponse,
  NovelDto,
  OutlineDto,
  PluginConfigField,
  PluginDto,
  StylePackDto,
} from '@novelagent/shared'
import { type GenerationProgressPayload } from '@novelagent/shared'
import type { Bridge } from '@/bridge'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const bridge = inject<Bridge>('bridge')

const novels = ref<NovelDto[]>([])
const stylePacks = ref<StylePackDto[]>([])
const pluginSchema = ref<PluginConfigField[]>([])
const pluginConfig = reactive<Record<string, unknown>>({})
const loading = ref(false)
const saving = ref(false)
const genres = ['玄幻', '都市', '科幻', '武侠', '悬疑', '言情', '其他']

const dialog = reactive({
  visible: false,
  form: { title: '', genre: '', stylePackId: '' as string | null, description: '' },
})

// 大纲生成（原独立页并入，按小说卡片打开）
const outline = reactive({
  visible: false,
  novel: null as NovelDto | null,
  idea: '',
  model: { providerId: 'builtin' } as ModelSelectionValue,
  generating: false,
  saving: false,
  progress: 0,
  progressMessage: '',
  result: null as GenerateOutlineResponse | null,
})

const stylePackGroups = computed(() => [
  { label: '内置风格包', options: stylePacks.value.filter((p) => p.sourceType === 'BUILTIN') },
  { label: '我的风格包', options: stylePacks.value.filter((p) => p.sourceType !== 'BUILTIN') },
])

const canGenerate = computed(
  () => !!outline.novel && !!outline.idea.trim(),
)

let offProgress: (() => void) | undefined

onMounted(async () => {
  await load()
  // 订阅生成进度（仅本页发起的大纲生成，双开标签页时丢弃其他来源）
  if (bridge) {
    offProgress = bridge.ctx.on('generation-progress', (payload: GenerationProgressPayload) => {
      if (!outline.generating || payload.novelId !== outline.novel?.id) return
      outline.progress = payload.progress
      outline.progressMessage = payload.message
    })
  }
})

onUnmounted(() => offProgress?.())

async function load() {
  loading.value = true
  try {
    ;[novels.value, stylePacks.value] = await Promise.all([
      get<NovelDto[]>('/api/novels'),
      get<StylePackDto[]>('/api/style-packs'),
    ])

    // 大纲生成插件的参数 schema（动态渲染表单，PRD 4.2）
    const plugins = await get<PluginDto[]>('/api/plugins')
    const outlinePlugin = plugins.find((p) => p.pluginId === 'outline-generator')
    if (outlinePlugin) {
      pluginSchema.value = outlinePlugin.configSchema
      for (const field of outlinePlugin.configSchema) {
        pluginConfig[field.key] = outlinePlugin.config[field.key] ?? field.default
      }
    }
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dialog.form = { title: '', genre: '', stylePackId: null, description: '' }
  dialog.visible = true
}

async function save() {
  if (!dialog.form.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  saving.value = true
  try {
    await post('/api/novels', dialog.form)
    dialog.visible = false
    await load()
    ElMessage.success('保存成功')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

async function remove(novel: NovelDto) {
  await ElMessageBox.confirm(`确定删除《${novel.title}》吗？`, '删除确认', { type: 'warning' })
  await del(`/api/novels/${novel.id}`)
  ElMessage.success('已删除')
  await load()
}

// ===== 大纲生成 =====

function openOutline(novel: NovelDto) {
  outline.novel = novel
  outline.idea = ''
  outline.model = { providerId: 'builtin' }
  outline.progress = 0
  outline.progressMessage = ''
  outline.result = null
  outline.visible = true
}

async function generateOutline() {
  if (!outline.novel || !canGenerate.value) return
  outline.generating = true
  outline.progress = 5
  outline.progressMessage = '准备中'
  outline.result = null
  try {
    outline.result = await post<GenerateOutlineResponse>('/api/writing/outline/generate', {
      novelId: outline.novel.id,
      idea: outline.idea.trim(),
      providerId: outline.model.providerId,
      modelConfigId: outline.model.modelConfigId,
      modelName: outline.model.modelName,
      pluginConfig: { ...pluginConfig },
    })
    outline.progress = 100
    ElMessage.success(`生成成功：${outline.result.outline.chapters.length} 章`)
    auth.fetchMe().catch(() => undefined) // 刷新积分显示
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    outline.generating = false
  }
}

async function saveOutline() {
  if (!outline.novel || !outline.result) return
  outline.saving = true
  try {
    await post<OutlineDto>('/api/writing/outline/save', {
      novelId: outline.novel.id,
      structure: outline.result.outline,
      generatedBy: 'outline-generator',
    })
    ElMessage.success('大纲已保存到小说')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    outline.saving = false
  }
}

function gotoEdit(novel: NovelDto) {
  router.push(`/novels/${novel.id}`)
}

function statusName(status: string): string {
  return { DRAFT: '草稿', ONGOING: '连载中', COMPLETED: '已完结', ARCHIVED: '已归档' }[status] ?? status
}
function statusType(status: string): string {
  return { DRAFT: 'info', ONGOING: 'success', COMPLETED: '', ARCHIVED: 'warning' }[status] ?? 'info'
}
</script>

<style scoped>
.novel-card {
  margin-bottom: 18px;
  height: calc(100% - 18px);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.15s ease;
}
.novel-card:hover {
  transform: translate(-2px, -2px);
}
.novel-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.novel-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--ink-strong);
  margin-bottom: 10px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.novel-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.novel-style {
  color: var(--ink-secondary);
  font-size: 12px;
  margin-bottom: 10px;
  letter-spacing: 0.04em;
}
.novel-desc {
  color: var(--ink-regular);
  font-size: 13px;
  line-height: 1.7;
  flex: 1;
  margin: 0 0 14px;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.novel-actions {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px dashed var(--line-soft);
}

/* 大纲生成对话框 */
.plugin-config {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--paper-bg-soft);
  border: 1px dashed var(--line-deep);
  border-radius: 8px;
  padding: 14px 16px;
}
.field-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.field-name {
  font-size: 13px;
  color: var(--ink-regular);
}
.generate-btn {
  width: 100%;
  margin-top: 4px;
  margin-bottom: 12px;
  letter-spacing: 0.2em;
  font-weight: 600;
}
.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.result-title {
  font-size: 17px;
  color: var(--ink-strong);
}
.logline {
  font-size: 15px;
  line-height: 1.8;
  color: var(--ink-strong);
  padding: 12px 16px;
  background: var(--accent-soft);
  border-left: 3px solid var(--gold);
  border-radius: 0 8px 8px 0;
  margin: 4px 0 12px;
}
.theme {
  font-size: 13px;
  color: var(--ink-secondary);
  margin: 0 0 14px;
}
.ml8 {
  margin-left: 8px;
}
</style>
