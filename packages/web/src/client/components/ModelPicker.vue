<template>
  <el-select
    v-model="selected"
    :disabled="disabled"
    :size="size"
    :style="{ width }"
    placeholder="模型选择"
    @change="onChange"
  >
    <el-option-group
      v-for="g in groups"
      :key="g.label"
      :label="g.label"
    >
      <el-option v-for="o in g.options" :key="o.value" :label="o.label" :value="o.value" />
    </el-option-group>
  </el-select>

  <!-- 添加自定义模型（用户自己的 API Key，保存后立即可选） -->
  <el-dialog v-model="dialog.visible" title="添加自定义模型" width="440px" append-to-body>
    <el-form :model="dialog" label-width="90px">
      <el-form-item label="模型厂商" required>
        <el-select
          v-model="dialog.providerId"
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
      <el-form-item label="名称" required>
        <el-input v-model="dialog.name" placeholder="如：我的 DeepSeek" />
      </el-form-item>
      <el-form-item label="模型名" required>
        <el-select
          v-model="dialog.modelName"
          style="width: 100%"
          filterable
          allow-create
          default-first-option
          placeholder="选择或输入模型名"
        >
          <el-option v-for="m in dialogProvider?.models ?? []" :key="m" :label="m" :value="m" />
        </el-select>
      </el-form-item>
      <el-form-item label="接口地址">
        <el-input v-model="dialog.baseUrl" :placeholder="`默认 ${dialogProvider?.defaultBaseUrl ?? ''}（可填中转）`" />
      </el-form-item>
      <el-form-item label="API Key" required>
        <el-input v-model="dialog.apiKey" type="password" show-password placeholder="sk-..." />
        <div v-if="dialogProvider?.keyHint" class="key-hint">{{ dialogProvider.keyHint }}</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialog.visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存并使用</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts">
/**
 * 模型选择值（三态）：
 * - 内置演示模型（mock）
 * - 系统模型直连：厂商预设 id + 模型名（平台 Key 由服务端 SYSTEM_MODEL_KEYS 占位提供）
 * - 自定义模型配置：用户自己的 Key
 */
export type ModelSelectionValue =
  | { providerId: 'builtin'; modelConfigId?: undefined; modelName?: undefined }
  | { providerId: string; modelConfigId?: undefined; modelName: string }
  | { providerId?: undefined; modelConfigId: string; modelName?: undefined }
</script>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { get, post } from '@/api/http'
import { SYSTEM_MODEL_PROVIDERS, getSystemProvider } from '@novelagent/shared'
import type { ModelConfigDto } from '@novelagent/shared'

const props = withDefaults(
  defineProps<{
    modelValue: ModelSelectionValue
    disabled?: boolean
    size?: 'small' | 'default' | 'large'
    width?: string
  }>(),
  {
    disabled: false,
    size: 'default',
    width: '100%',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: ModelSelectionValue] }>()

/** “添加自定义模型”占位项：选中后弹对话框而不切换选择 */
const ADD_NEW = '__add_new__'
/** 系统模型直连项前缀：sys:<providerId>:<modelName> */
const SYS_PREFIX = 'sys:'

const configs = ref<ModelConfigDto[]>([])
const selected = ref<string>('builtin')
let lastEmitted = 'builtin'

/** 厂商短名（下拉里「厂商 · 模型」用，取 providerName 中第一段） */
function shortName(providerId: string): string {
  const name = getSystemProvider(providerId)?.providerName ?? providerId
  return name.split(/[（(\s]/)[0]
}

/**
 * 下拉两大分组（Trae 式模型选择）：
 * - 系统模型：内置演示 mock + 各厂商预设模型（平台提供，直接选，消耗积分）
 * - 自定义模型：用户保存的配置（自己的 Key，不耗积分）+ 添加入口
 */
const groups = computed(() => {
  const systemOptions = [
    { value: 'builtin', label: '内置演示模型（mock）' },
    ...SYSTEM_MODEL_PROVIDERS.flatMap((p) =>
      p.models.map((m) => ({ value: `${SYS_PREFIX}${p.providerId}:${m}`, label: `${shortName(p.providerId)} · ${m}` })),
    ),
  ]
  return [
    { label: '系统模型（平台提供，消耗积分）', options: systemOptions },
    {
      label: '自定义模型（自己的 API Key）',
      options: [
        ...configs.value.map((c) => ({ value: c.id, label: `${c.name}（${c.modelName}）` })),
        { value: ADD_NEW, label: '＋ 添加自定义模型…' },
      ],
    },
  ]
})

/** 外部值 → 内部字符串（builtin / sys:pid:model / 配置 id） */
function toInternal(v: ModelSelectionValue): string {
  if (v.providerId === 'builtin' || (!v.modelConfigId && !v.modelName)) return 'builtin'
  if (v.modelConfigId) return v.modelConfigId
  return `${SYS_PREFIX}${v.providerId}:${v.modelName}`
}

watch(
  () => props.modelValue,
  (v) => {
    const s = toInternal(v)
    if (s !== selected.value) {
      selected.value = s
      lastEmitted = s
    }
  },
  { immediate: true },
)

onMounted(async () => {
  try {
    configs.value = await get<ModelConfigDto[]>('/api/models/configs')
  } catch {
    // 列表加载失败不阻断页面，可稍后在模型设置页配置
  }
})

function onChange(v: string) {
  if (v === ADD_NEW) {
    selected.value = lastEmitted // 占位项不切换显示，回退原选择
    openAddDialog()
    return
  }
  lastEmitted = v
  if (v === 'builtin') {
    emit('update:modelValue', { providerId: 'builtin' })
    return
  }
  if (v.startsWith(SYS_PREFIX)) {
    const rest = v.slice(SYS_PREFIX.length)
    const idx = rest.indexOf(':')
    emit('update:modelValue', { providerId: rest.slice(0, idx), modelName: rest.slice(idx + 1) })
    return
  }
  emit('update:modelValue', { modelConfigId: v })
}

// ===== 添加自定义模型 =====

const saving = ref(false)
const dialog = reactive({
  visible: false,
  providerId: '',
  name: '',
  modelName: '',
  baseUrl: '',
  apiKey: '',
})
const dialogProvider = computed(() =>
  SYSTEM_MODEL_PROVIDERS.find((p) => p.providerId === dialog.providerId),
)

function openAddDialog() {
  const first = SYSTEM_MODEL_PROVIDERS[0]
  dialog.providerId = first.providerId
  dialog.name = `我的${shortName(first.providerId)}`
  dialog.modelName = first.defaultModel
  dialog.baseUrl = first.defaultBaseUrl
  dialog.apiKey = ''
  dialog.visible = true
}

/** 选择厂商时联动默认名称/模型/接口地址（用户已改过则以厂商默认覆盖，保持简单） */
function onProviderChange() {
  const p = dialogProvider.value
  if (!p) return
  dialog.name = `我的${shortName(p.providerId)}`
  dialog.modelName = p.defaultModel
  dialog.baseUrl = p.defaultBaseUrl
}

async function save() {
  if (!dialog.providerId) {
    ElMessage.warning('请选择模型厂商')
    return
  }
  if (!dialog.name.trim() || !dialog.modelName.trim()) {
    ElMessage.warning('请填写名称与模型名')
    return
  }
  if (!dialog.apiKey.trim()) {
    ElMessage.warning('请填写 API Key')
    return
  }
  saving.value = true
  try {
    const created = await post<ModelConfigDto>('/api/models/configs', {
      providerId: dialog.providerId,
      name: dialog.name.trim(),
      modelName: dialog.modelName.trim(),
      baseUrl: dialog.baseUrl.trim() || undefined,
      apiKey: dialog.apiKey.trim(),
    })
    dialog.visible = false
    configs.value.push(created)
    selected.value = created.id
    lastEmitted = created.id
    emit('update:modelValue', { modelConfigId: created.id })
    ElMessage.success(`已保存并使用「${created.name}」`)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.key-hint {
  font-size: 12px;
  color: var(--ink-regular, #909399);
  margin-top: 4px;
  line-height: 1.4;
}
</style>
