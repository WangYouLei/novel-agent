<template>
  <div class="page">
    <div class="page-header">
      <h2>我的小说</h2>
      <el-button type="primary" @click="openCreate">创建小说</el-button>
    </div>

    <el-empty v-if="!loading && novels.length === 0" description="还没有小说，点击右上角创建" />

    <el-row :gutter="16">
      <el-col v-for="novel in novels" :key="novel.id" :xs="24" :sm="12" :md="8" :lg="6">
        <el-card class="novel-card" shadow="hover">
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
            <el-button size="small" type="primary" plain @click="gotoOutline(novel)">生成大纲</el-button>
            <el-button size="small" @click="openEdit(novel)">编辑</el-button>
            <el-button size="small" type="danger" plain @click="remove(novel)">删除</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 创建 / 编辑对话框（含主体风格包选择，PRD 5.3） -->
    <el-dialog v-model="dialog.visible" :title="dialog.isEdit ? '编辑小说' : '创建小说'" width="480px">
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { del, get, post, put } from '@/api/http'
import type { NovelDto, StylePackDto } from '@novelagent/shared'

const router = useRouter()
const novels = ref<NovelDto[]>([])
const stylePacks = ref<StylePackDto[]>([])
const loading = ref(false)
const saving = ref(false)
const genres = ['玄幻', '都市', '科幻', '武侠', '悬疑', '言情', '其他']

const dialog = reactive({
  visible: false,
  isEdit: false,
  editId: '',
  form: { title: '', genre: '', stylePackId: '' as string | null, description: '' },
})

const stylePackGroups = computed(() => [
  { label: '内置风格包', options: stylePacks.value.filter((p) => p.sourceType === 'BUILTIN') },
  { label: '我的风格包', options: stylePacks.value.filter((p) => p.sourceType !== 'BUILTIN') },
])

onMounted(load)

async function load() {
  loading.value = true
  try {
    ;[novels.value, stylePacks.value] = await Promise.all([
      get<NovelDto[]>('/api/novels'),
      get<StylePackDto[]>('/api/style-packs'),
    ])
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    loading.value = false
  }
}

function openCreate() {
  dialog.isEdit = false
  dialog.editId = ''
  dialog.form = { title: '', genre: '', stylePackId: null, description: '' }
  dialog.visible = true
}

function openEdit(novel: NovelDto) {
  dialog.isEdit = true
  dialog.editId = novel.id
  dialog.form = {
    title: novel.title,
    genre: novel.genre ?? '',
    stylePackId: novel.stylePackId,
    description: novel.description ?? '',
  }
  dialog.visible = true
}

async function save() {
  if (!dialog.form.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  saving.value = true
  try {
    if (dialog.isEdit) {
      await put(`/api/novels/${dialog.editId}`, dialog.form)
    } else {
      await post('/api/novels', dialog.form)
    }
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

function gotoOutline(novel: NovelDto) {
  router.push({ path: '/outline', query: { novelId: novel.id } })
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
}
.novel-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.novel-title {
  font-family: Georgia, 'Noto Serif SC', 'Songti SC', serif;
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
</style>
