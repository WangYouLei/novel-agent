<template>
  <div class="page">
    <div class="page-header">
      <h2>风格包</h2>
      <span class="hint">内置风格包只读，可复制为副本后自由修改（PRD 3.3）</span>
      <el-button type="primary" @click="openGenerate">上传小说生成</el-button>
    </div>

    <el-table v-loading="loading" :data="packs" class="pack-table">
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="来源" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.sourceType === 'BUILTIN' ? 'info' : 'success'">
            {{ sourceName(row.sourceType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="风格说明" min-width="240" show-overflow-tooltip>
        <template #default="{ row }">{{ row.content.styleSummary }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openDetail(row)">查看</el-button>
          <el-button v-if="row.modifiable" size="small" type="primary" plain @click="openEdit(row)">
            编辑
          </el-button>
          <el-button v-else size="small" type="primary" plain @click="fork(row)">复制</el-button>
          <el-button
            v-if="row.sourceType !== 'BUILTIN'"
            size="small"
            type="danger"
            plain
            @click="remove(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑对话框：手动修改风格包内容 -->
    <el-dialog v-model="edit.visible" title="编辑风格包" width="580px">
      <el-form :model="edit.form" label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="edit.form.name" maxlength="50" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="edit.form.description" type="textarea" :rows="2" maxlength="200" />
        </el-form-item>
        <el-form-item label="风格说明">
          <el-input
            v-model="edit.form.styleSummary"
            type="textarea"
            :rows="2"
            placeholder="一句话概括该风格，用于展示"
          />
        </el-form-item>
        <el-form-item label="风格指令">
          <el-input
            v-model="edit.form.promptGuidance"
            type="textarea"
            :rows="4"
            placeholder="注入模型提示词的风格指令"
          />
        </el-form-item>
        <el-form-item label="词汇偏好">
          <el-input
            v-model="edit.form.vocabText"
            type="textarea"
            :rows="3"
            placeholder="每行一个词，如：灵气 / 境界"
          />
        </el-form-item>
        <el-form-item label="示例句">
          <el-input
            v-model="edit.form.sampleText"
            type="textarea"
            :rows="3"
            placeholder="每行一句，用于辅助模型对齐语感"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="edit.visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 上传小说生成风格包对话框（style-generator 插件链路） -->
    <el-dialog v-model="gen.visible" title="上传小说生成风格包" width="640px" :close-on-click-modal="false">
      <el-form label-position="top">
        <el-form-item label="风格包名称">
          <el-input v-model="gen.name" maxlength="50" placeholder="留空则自动命名为「上传小说风格包」" />
        </el-form-item>
        <el-form-item label="小说文本（.txt）">
          <div class="upload-row">
            <input ref="fileInput" type="file" accept=".txt" class="upload-input" @change="onFilePicked" />
            <el-button size="small" @click="fileInput?.click()">选择文件</el-button>
            <span v-if="gen.fileName" class="upload-name">{{ gen.fileName }}</span>
            <span class="upload-count">{{ gen.sourceText.length }} 字</span>
          </div>
          <el-input
            v-model="gen.sourceText"
            type="textarea"
            :rows="8"
            placeholder="上传 .txt 文件自动填充，也可直接粘贴小说文本"
          />
        </el-form-item>
        <el-form-item label="使用模型">
          <el-radio-group v-model="gen.modelMode">
            <el-radio value="builtin">内置免费模型</el-radio>
            <el-radio value="custom" :disabled="modelConfigs.length === 0">
              自定义模型{{ modelConfigs.length === 0 ? '（未配置）' : '' }}
            </el-radio>
          </el-radio-group>
          <el-select
            v-if="gen.modelMode === 'custom'"
            v-model="gen.modelConfigId"
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
        <el-form-item v-if="gen.schema.length" label="提取参数">
          <div class="gen-config">
            <template v-for="field in gen.schema" :key="field.key">
              <div v-if="field.type === 'number'" class="field-row">
                <span class="field-name">{{ field.name }}</span>
                <el-input-number
                  v-model="gen.pluginConfig[field.key]"
                  :min="field.min"
                  :max="field.max"
                  size="small"
                />
              </div>
              <div v-else-if="field.type === 'boolean'" class="field-row">
                <span class="field-name">{{ field.name }}</span>
                <el-switch v-model="gen.pluginConfig[field.key]" />
              </div>
            </template>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="gen.visible = false">取消</el-button>
        <el-button type="primary" :loading="generating" :disabled="!canGenerate" @click="generate">
          {{ generating ? '分析中…' : '生成风格包' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 查看对话框：只读展示完整内容 -->
    <el-dialog v-model="detail.visible" :title="detail.pack?.name ?? '风格包'" width="580px">
      <template v-if="detail.pack">
        <div class="detail-meta">
          <el-tag size="small" :type="detail.pack.sourceType === 'BUILTIN' ? 'info' : 'success'">
            {{ sourceName(detail.pack.sourceType) }}
          </el-tag>
          <span v-if="detail.pack.description" class="detail-desc">{{ detail.pack.description }}</span>
        </div>
        <div class="detail-section">
          <div class="detail-label">风格说明</div>
          <p class="serif">{{ detail.pack.content.styleSummary }}</p>
        </div>
        <div class="detail-section">
          <div class="detail-label">风格指令</div>
          <p class="serif">{{ detail.pack.content.promptGuidance }}</p>
        </div>
        <div class="detail-section">
          <div class="detail-label">词汇偏好</div>
          <div class="vocab-list">
            <el-tag v-for="w in detail.pack.content.vocabPreferences" :key="w" size="small" effect="plain">
              {{ w }}
            </el-tag>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">示例句</div>
          <ul class="sample-list">
            <li v-for="(s, i) in detail.pack.content.sampleSentences" :key="i" class="serif">
              {{ s }}
            </li>
          </ul>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { del, get, post, put } from '@/api/http'
import type {
  ModelConfigDto,
  PluginConfigField,
  PluginDto,
  StylePackDto,
  StylePackSourceType,
} from '@novelagent/shared'

const packs = ref<StylePackDto[]>([])
const loading = ref(false)
const saving = ref(false)
const generating = ref(false)
const modelConfigs = ref<ModelConfigDto[]>([])
const fileInput = ref<HTMLInputElement>()

const edit = reactive({
  visible: false,
  id: '',
  form: {
    name: '',
    description: '',
    styleSummary: '',
    promptGuidance: '',
    vocabText: '',
    sampleText: '',
  },
})

const detail = reactive<{ visible: boolean; pack: StylePackDto | null }>({
  visible: false,
  pack: null,
})

/** 上传生成对话框状态（style-generator 插件） */
const gen = reactive({
  visible: false,
  name: '',
  sourceText: '',
  fileName: '',
  modelMode: 'builtin' as 'builtin' | 'custom',
  modelConfigId: '',
  schema: [] as PluginConfigField[],
  pluginConfig: {} as Record<string, unknown>,
})

const canGenerate = computed(
  () => gen.sourceText.trim().length > 0 && (gen.modelMode === 'builtin' || gen.modelConfigId),
)

onMounted(load)

async function load() {
  loading.value = true
  try {
    packs.value = await get<StylePackDto[]>('/api/style-packs')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function sourceName(type: StylePackSourceType): string {
  return type === 'BUILTIN' ? '内置' : type === 'USER_GENERATED' ? '我的' : '第三方'
}

/** 打开生成对话框：懒加载模型配置与插件参数 schema */
async function openGenerate() {
  gen.visible = true
  gen.name = ''
  gen.sourceText = ''
  gen.fileName = ''
  gen.modelMode = 'builtin'
  gen.modelConfigId = ''
  if (fileInput.value) fileInput.value.value = ''
  if (modelConfigs.value.length === 0 && gen.schema.length === 0) {
    try {
      const [configs, plugins] = await Promise.all([
        get<ModelConfigDto[]>('/api/models/configs'),
        get<PluginDto[]>('/api/plugins'),
      ])
      modelConfigs.value = configs
      const plugin = plugins.find((p) => p.pluginId === 'style-generator')
      if (plugin) {
        gen.schema = plugin.configSchema
        for (const field of plugin.configSchema) {
          gen.pluginConfig[field.key] = plugin.config[field.key] ?? field.default
        }
      }
    } catch (err) {
      ElMessage.error((err as Error).message)
    }
  }
}

/** 读取 .txt 文件填充文本（UTF-8 出现乱码时回退 GBK 解码） */
async function onFilePicked(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    let text = await file.text()
    if (text.includes('\uFFFD')) {
      const buf = await file.arrayBuffer()
      text = new TextDecoder('gbk').decode(buf)
    }
    gen.fileName = file.name
    gen.sourceText = text
  } catch (err) {
    ElMessage.error(`文件读取失败：${(err as Error).message}`)
  }
}

async function generate() {
  generating.value = true
  try {
    const pack = await post<StylePackDto>('/api/style-packs/generate', {
      name: gen.name.trim() || undefined,
      sourceText: gen.sourceText,
      providerId: gen.modelMode === 'builtin' ? 'builtin' : 'openai-model',
      modelConfigId: gen.modelMode === 'builtin' ? undefined : gen.modelConfigId,
      pluginConfig: { ...gen.pluginConfig },
    })
    ElMessage.success(`风格包「${pack.name}」已生成`)
    gen.visible = false
    await load()
    openEdit(pack)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    generating.value = false
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

function openEdit(pack: StylePackDto) {
  edit.id = pack.id
  edit.form = {
    name: pack.name,
    description: pack.description ?? '',
    styleSummary: pack.content.styleSummary,
    promptGuidance: pack.content.promptGuidance,
    vocabText: pack.content.vocabPreferences.join('\n'),
    sampleText: pack.content.sampleSentences.join('\n'),
  }
  edit.visible = true
}

function openDetail(pack: StylePackDto) {
  detail.pack = pack
  detail.visible = true
}

/** 多行文本 → 数组：按行拆分、去空行、去首尾空白 */
function linesToArray(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

async function save() {
  if (!edit.form.name.trim()) {
    ElMessage.warning('请填写名称')
    return
  }
  saving.value = true
  try {
    await put<StylePackDto>(`/api/style-packs/${edit.id}`, {
      name: edit.form.name.trim(),
      description: edit.form.description.trim() || null,
      content: {
        styleSummary: edit.form.styleSummary.trim(),
        promptGuidance: edit.form.promptGuidance.trim(),
        vocabPreferences: linesToArray(edit.form.vocabText),
        sampleSentences: linesToArray(edit.form.sampleText),
      },
    })
    ElMessage.success('风格包已保存')
    edit.visible = false
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

/** 复制内置包为可编辑副本，成功后直接进入编辑 */
async function fork(pack: StylePackDto) {
  try {
    const created = await post<StylePackDto>(`/api/style-packs/${pack.id}/fork`)
    ElMessage.success('已复制为我的风格包')
    await load()
    openEdit(created)
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function remove(pack: StylePackDto) {
  try {
    await ElMessageBox.confirm(`确定删除风格包「${pack.name}」？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await del(`/api/style-packs/${pack.id}`)
    ElMessage.success('已删除')
    await load()
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}
</script>

<style scoped>
.pack-table {
  background: var(--card-bg);
  border-radius: 12px;
}
.page-header .el-button {
  margin-left: auto;
}
.upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  width: 100%;
}
.upload-input {
  display: none;
}
.upload-name {
  font-size: 13px;
  color: var(--ink-strong);
}
.upload-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--ink-secondary);
}
.gen-config {
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
.detail-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.detail-desc {
  font-size: 13px;
  color: var(--ink-secondary);
}
.detail-section {
  margin-bottom: 14px;
}
.detail-label {
  font-size: 12px;
  color: var(--ink-secondary);
  margin-bottom: 6px;
  letter-spacing: 0.08em;
}
.detail-section p {
  margin: 0;
  padding: 10px 14px;
  background: var(--paper-bg-soft);
  border-left: 3px solid var(--gold);
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--ink-strong);
}
.vocab-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sample-list {
  margin: 0;
  padding-left: 18px;
}
.sample-list li {
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-strong);
}
</style>
