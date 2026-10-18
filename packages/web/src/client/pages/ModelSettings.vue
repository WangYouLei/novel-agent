<template>
  <div class="page">
    <div class="page-header">
      <h2>模型设置</h2>
      <el-button type="primary" @click="openCreate">添加自定义模型</el-button>
    </div>

    <el-alert
      title="自定义模型使用你自己的 API Key 调用（OpenAI 兼容接口），不消耗积分；内置免费模型按次扣积分。"
      type="info"
      show-icon
      :closable="false"
      class="tip"
    />

    <el-table :data="configs" border>
      <el-table-column prop="name" label="名称" min-width="120" />
      <el-table-column prop="providerName" label="厂商" width="200" />
      <el-table-column prop="modelName" label="模型" width="140" />
      <el-table-column prop="baseUrl" label="接口地址" min-width="180">
        <template #default="{ row }">
          {{ row.baseUrl || defaultBaseUrlOf(row.providerId) || '—' }}
        </template>
      </el-table-column>
      <el-table-column prop="apiKeyMasked" label="API Key" width="140" />
      <el-table-column label="默认" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.isDefault" size="small" type="success">默认</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <el-button size="small" type="danger" plain @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑模型配置' : '添加自定义模型'" width="480px">
      <el-form :model="dialog.form" label-width="100px">
        <el-form-item label="名称" required>
          <el-input v-model="dialog.form.name" placeholder="如：我的 DeepSeek" />
        </el-form-item>
        <el-form-item label="模型厂商" required>
          <el-select
            v-model="dialog.form.providerId"
            :disabled="dialog.isEdit"
            style="width: 100%"
            placeholder="选择厂商"
            @change="onProviderChange"
          >
            <el-option
              v-for="p in SYSTEM_MODEL_PROVIDERS"
              :key="p.providerId"
              :label="p.providerName"
              :value="p.providerId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="模型名" required>
          <el-select
            v-model="dialog.form.modelName"
            style="width: 100%"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入模型名"
          >
            <el-option v-for="m in currentModels" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="接口地址">
          <el-input v-model="dialog.form.baseUrl" :placeholder="`默认 ${currentDefaultBaseUrl}（可填中转）`" />
        </el-form-item>
        <el-form-item :label="dialog.isEdit ? 'API Key（留空不改）' : 'API Key'" :required="!dialog.isEdit">
          <el-input v-model="dialog.form.apiKey" type="password" show-password placeholder="sk-..." />
          <div v-if="currentKeyHint" class="key-hint">{{ currentKeyHint }}</div>
        </el-form-item>
        <el-form-item label="设为默认">
          <el-switch v-model="dialog.form.isDefault" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { del, get, post, put } from '@/api/http'
import { SYSTEM_MODEL_PROVIDERS } from '@novelagent/shared'
import type { ModelConfigDto } from '@novelagent/shared'

const configs = ref<ModelConfigDto[]>([])
const saving = ref(false)

const dialog = reactive({
  visible: false,
  isEdit: false,
  editId: '',
  form: { providerId: '', name: '', modelName: '', baseUrl: '', apiKey: '', isDefault: false },
})

const currentProvider = computed(() =>
  SYSTEM_MODEL_PROVIDERS.find((p) => p.providerId === dialog.form.providerId),
)
const currentModels = computed(() => currentProvider.value?.models ?? [])
const currentDefaultBaseUrl = computed(
  () => currentProvider.value?.defaultBaseUrl ?? 'https://api.openai.com/v1',
)
const currentKeyHint = computed(() => currentProvider.value?.keyHint ?? '')

function defaultBaseUrlOf(providerId: string): string {
  return SYSTEM_MODEL_PROVIDERS.find((p) => p.providerId === providerId)?.defaultBaseUrl ?? ''
}

onMounted(load)

async function load() {
  configs.value = await get<ModelConfigDto[]>('/api/models/configs')
}

/** 选择厂商时联动默认模型与默认接口地址（用户已改过 baseUrl 则以厂商默认覆盖，保持简单） */
function onProviderChange() {
  const p = currentProvider.value
  if (!p) return
  dialog.form.modelName = p.defaultModel
  dialog.form.baseUrl = p.defaultBaseUrl
}

function openCreate() {
  dialog.isEdit = false
  dialog.editId = ''
  dialog.form = { providerId: '', name: '', modelName: '', baseUrl: '', apiKey: '', isDefault: false }
  dialog.visible = true
}

function openEdit(row: ModelConfigDto) {
  dialog.isEdit = true
  dialog.editId = row.id
  dialog.form = {
    providerId: row.providerId,
    name: row.name,
    modelName: row.modelName,
    baseUrl: row.baseUrl ?? '',
    apiKey: '',
    isDefault: row.isDefault,
  }
  dialog.visible = true
}

async function save() {
  if (!dialog.form.providerId) {
    ElMessage.warning('请选择模型厂商')
    return
  }
  if (!dialog.form.name.trim() || !dialog.form.modelName.trim()) {
    ElMessage.warning('请填写名称与模型名')
    return
  }
  if (!dialog.isEdit && !dialog.form.apiKey.trim()) {
    ElMessage.warning('请填写 API Key')
    return
  }
  saving.value = true
  try {
    if (dialog.isEdit) {
      const body: Record<string, unknown> = {
        name: dialog.form.name,
        modelName: dialog.form.modelName,
        baseUrl: dialog.form.baseUrl || null,
        isDefault: dialog.form.isDefault,
      }
      if (dialog.form.apiKey.trim()) body.apiKey = dialog.form.apiKey.trim()
      await put(`/api/models/configs/${dialog.editId}`, body)
    } else {
      await post('/api/models/configs', {
        providerId: dialog.form.providerId,
        name: dialog.form.name,
        modelName: dialog.form.modelName,
        baseUrl: dialog.form.baseUrl || undefined,
        apiKey: dialog.form.apiKey.trim(),
        isDefault: dialog.form.isDefault,
      })
    }
    dialog.visible = false
    await load()
    ElMessage.success('已保存')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}

async function remove(row: ModelConfigDto) {
  await ElMessageBox.confirm(`确定删除模型配置「${row.name}」吗？`, '删除确认', { type: 'warning' })
  await del(`/api/models/configs/${row.id}`)
  ElMessage.success('已删除')
  await load()
}
</script>

<style scoped>
.tip {
  margin-bottom: 18px;
  border-radius: 8px;
}
.key-hint {
  font-size: 12px;
  color: var(--ink-regular, #909399);
  margin-top: 4px;
  line-height: 1.4;
}
</style>
