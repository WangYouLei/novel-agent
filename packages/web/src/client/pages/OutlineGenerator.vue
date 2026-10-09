<template>
  <div class="page">
    <div class="page-header">
      <h2>大纲生成</h2>
      <span class="hint">创意 → 选择风格与模型 → 生成 → 保存（MVP 核心链路）</span>
    </div>

    <el-row :gutter="16">
      <!-- 左侧：生成配置 -->
      <el-col :md="10">
        <el-card class="config-card">
          <el-form label-position="top">
            <el-form-item label="选择小说" required>
              <el-select v-model="form.novelId" style="width: 100%" placeholder="选择要生成大纲的小说">
                <el-option
                  v-for="n in novels"
                  :key="n.id"
                  :label="`${n.title}（风格：${n.stylePackName ?? '默认'}）`"
                  :value="n.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="一句话创意" required>
              <el-input
                v-model="form.idea"
                type="textarea"
                :rows="3"
                maxlength="2000"
                show-word-limit
                placeholder="例如：废柴少年捡到一枚会说话的戒指，从此走上逆袭之路"
              />
            </el-form-item>

            <el-form-item label="使用模型">
              <el-radio-group v-model="modelMode">
                <el-radio value="builtin">内置免费模型（{{ OUTLINE_COST }} 积分/次）</el-radio>
                <el-radio value="custom" :disabled="modelConfigs.length === 0">
                  自定义模型{{ modelConfigs.length === 0 ? '（未配置）' : '' }}
                </el-radio>
              </el-radio-group>
              <el-select
                v-if="modelMode === 'custom'"
                v-model="form.modelConfigId"
                style="width: 100%; margin-top: 8px"
                placeholder="选择模型配置"
              >
                <el-option
                  v-for="m in modelConfigs"
                  :key="m.id"
                  :label="`${m.name}（${m.modelName}）`"
                  :value="m.id"
                />
              </el-select>
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
              :loading="generating"
              :disabled="!canGenerate"
              @click="generate"
            >
              {{ generating ? `生成中 ${progress}%` : '生成大纲' }}
            </el-button>
            <el-progress
              v-if="generating"
              :percentage="progress"
              :stroke-width="8"
              :format="() => progressMessage"
            />
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：结果预览 -->
      <el-col :md="14">
        <el-card v-if="!result" class="result-card">
          <el-empty description="生成的大纲将在这里展示" />
        </el-card>
        <el-card v-else class="result-card">
          <template #header>
            <div class="result-header">
              <span class="result-title">{{ result.outline.title }}</span>
              <div>
                <el-tag size="small" type="info">
                  {{ result.modelCall.modelProvider }} / {{ result.modelCall.modelName }}
                </el-tag>
                <el-tag v-if="result.modelCall.creditCost > 0" size="small" type="warning" class="ml8">
                  -{{ result.modelCall.creditCost }} 积分
                </el-tag>
                <el-tag size="small" class="ml8">
                  tokens: {{ result.modelCall.inputTokens }}入/{{ result.modelCall.outputTokens }}出
                </el-tag>
                <el-button size="small" type="primary" :loading="saving" class="ml8" @click="save">
                  保存到小说
                </el-button>
              </div>
            </div>
          </template>
          <p class="logline">{{ result.outline.logline }}</p>
          <p class="theme">主题：{{ result.outline.theme }}</p>
          <el-collapse>
            <el-collapse-item
              v-for="chapter in result.outline.chapters"
              :key="chapter.no"
              :title="chapter.title"
            >
              <div>{{ chapter.summary }}</div>
            </el-collapse-item>
          </el-collapse>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { get, post } from '@/api/http'
import type {
  GenerateOutlineResponse,
  ModelConfigDto,
  NovelDto,
  OutlineDto,
  PluginDto,
  PluginConfigField,
} from '@novelagent/shared'
import { CREDIT_POLICY, type GenerationProgressPayload } from '@novelagent/shared'
import type { Context } from 'cordis'
import { useAuthStore } from '@/stores/auth'

const OUTLINE_COST = CREDIT_POLICY.OUTLINE_GENERATION_COST
const route = useRoute()
const auth = useAuthStore()
const bridgeCtx = inject<Context>('bridge')

const novels = ref<NovelDto[]>([])
const modelConfigs = ref<ModelConfigDto[]>([])
const pluginSchema = ref<PluginConfigField[]>([])
const modelMode = ref<'builtin' | 'custom'>('builtin')
const pluginConfig = reactive<Record<string, unknown>>({})

const form = reactive({
  novelId: (route.query.novelId as string) ?? '',
  idea: '',
  modelConfigId: '',
})

const generating = ref(false)
const saving = ref(false)
const progress = ref(0)
const progressMessage = ref('')
const result = ref<GenerateOutlineResponse | null>(null)

const canGenerate = computed(
  () => form.novelId && form.idea.trim() && (modelMode.value === 'builtin' || form.modelConfigId),
)

let offProgress: (() => void) | undefined

onMounted(async () => {
  await load()
  // 订阅生成进度（前端 Cordis 事件总线，Bridge 转发的 socket 事件）
  if (bridgeCtx) {
    offProgress = bridgeCtx.on('generation-progress', (payload: GenerationProgressPayload) => {
      progress.value = payload.progress
      progressMessage.value = payload.message
    })
  }
})

onUnmounted(() => offProgress?.())

async function load() {
  try {
    ;[novels.value, modelConfigs.value] = await Promise.all([
      get<NovelDto[]>('/api/novels'),
      get<ModelConfigDto[]>('/api/models/configs'),
    ])
    if (!form.novelId && novels.value.length > 0) form.novelId = novels.value[0].id

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
  }
}

async function generate() {
  generating.value = true
  progress.value = 5
  progressMessage.value = '准备中'
  result.value = null
  try {
    result.value = await post<GenerateOutlineResponse>('/api/writing/outline/generate', {
      novelId: form.novelId,
      idea: form.idea.trim(),
      providerId: modelMode.value === 'builtin' ? 'builtin' : 'openai-model',
      modelConfigId: modelMode.value === 'builtin' ? undefined : form.modelConfigId,
      pluginConfig: { ...pluginConfig },
    })
    progress.value = 100
    ElMessage.success(`生成成功：${result.value.outline.chapters.length} 章`)
    auth.fetchMe().catch(() => undefined) // 刷新积分显示
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    generating.value = false
  }
}

async function save() {
  if (!result.value) return
  saving.value = true
  try {
    await post<OutlineDto>('/api/writing/outline/save', {
      novelId: form.novelId,
      structure: result.value.outline,
      generatedBy: 'outline-generator',
    })
    ElMessage.success('大纲已保存到小说')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.config-card,
.result-card {
  border-radius: 12px;
}
.config-card :deep(.el-card__body),
.result-card :deep(.el-card__body) {
  padding: 22px 24px;
}
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
}
.result-title {
  font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif;
  font-size: 17px;
  color: var(--ink-strong);
}
.logline {
  font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif;
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
