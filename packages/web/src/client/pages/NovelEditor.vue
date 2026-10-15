<template>
  <div v-if="novel" class="page editor-page">
    <div class="editor-header">
      <div class="editor-title-wrap">
        <el-button :icon="ArrowLeft" circle @click="$router.push('/novels')" />
        <h2 class="editor-title serif">《{{ novel.title }}》</h2>
        <el-tag size="small" :type="statusType(novel.status)">{{ statusName(novel.status) }}</el-tag>
        <span class="editor-wordcount">共 {{ novel.wordCount }} 字</span>
      </div>
    </div>

    <el-row :gutter="16" class="editor-layout">
      <!-- 左侧：小说信息 + 章节编辑 -->
      <el-col :md="15" class="edit-col">
        <el-card class="edit-card" shadow="never">
          <el-tabs v-model="activeTab" class="edit-tabs">
            <el-tab-pane label="小说信息" name="info">
              <el-form :model="novelForm" label-width="90px" class="info-form">
                <el-form-item label="标题" required>
                  <el-input v-model="novelForm.title" maxlength="50" />
                </el-form-item>
                <el-form-item label="类型">
                  <el-select v-model="novelForm.genre" placeholder="选择类型" clearable style="width: 100%">
                    <el-option v-for="g in genres" :key="g" :label="g" :value="g" />
                  </el-select>
                </el-form-item>
                <el-form-item label="状态">
                  <el-select v-model="novelForm.status" style="width: 100%">
                    <el-option label="草稿" value="DRAFT" />
                    <el-option label="连载中" value="ONGOING" />
                    <el-option label="已完结" value="COMPLETED" />
                    <el-option label="已归档" value="ARCHIVED" />
                  </el-select>
                </el-form-item>
                <el-form-item label="主体风格包">
                  <el-select
                    v-model="novelForm.stylePackId"
                    placeholder="不选则由插件使用兜底风格"
                    clearable
                    style="width: 100%"
                  >
                    <el-option-group v-for="group in stylePackGroups" :key="group.label" :label="group.label">
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
                  <el-input v-model="novelForm.description" type="textarea" :rows="3" maxlength="500" />
                </el-form-item>
                <el-form-item>
                  <el-button type="primary" :loading="savingNovel" @click="saveNovel">保存信息</el-button>
                </el-form-item>
              </el-form>
            </el-tab-pane>

            <el-tab-pane :label="`章节正文（${chapters.length}）`" name="chapters">
              <div class="chapter-toolbar">
                <el-select
                  v-model="activeChapterId"
                  placeholder="选择章节"
                  style="flex: 1"
                  @change="onSelectChapter"
                >
                  <el-option v-for="c in chapters" :key="c.id" :label="`第${c.no}章 ${c.title}`" :value="c.id" />
                </el-select>
                <el-button type="primary" plain @click="createChapter">＋ 新建章节</el-button>
                <el-button
                  v-if="editingChapter"
                  type="danger"
                  plain
                  :loading="deletingChapter"
                  @click="removeChapter"
                >
                  删除
                </el-button>
              </div>

              <template v-if="editingChapter">
                <el-form label-width="70px" class="chapter-form">
                  <el-form-item label="章节标题" required>
                    <el-input v-model="editingChapter.title" maxlength="100" />
                  </el-form-item>
                  <el-form-item label="章节状态">
                    <el-select v-model="editingChapter.status">
                      <el-option label="草稿" value="DRAFT" />
                      <el-option label="已出纲" value="OUTLINED" />
                      <el-option label="写作中" value="WRITING" />
                      <el-option label="审校中" value="REVIEWING" />
                      <el-option label="已发布" value="PUBLISHED" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="章节摘要">
                    <el-input v-model="editingChapter.summary" type="textarea" :rows="2" maxlength="500" />
                  </el-form-item>
                  <el-form-item label="正文">
                    <el-input
                      v-model="editingChapter.content"
                      type="textarea"
                      :rows="14"
                      class="chapter-content"
                      placeholder="在此手动写作或修改章节正文…"
                    />
                  </el-form-item>
                </el-form>
                <div class="chapter-save-bar">
                  <span class="chapter-count">{{ (editingChapter.content ?? '').length }} 字</span>
                  <el-button type="primary" :loading="savingChapter" @click="saveChapter">保存章节</el-button>
                </div>
              </template>
              <el-empty v-else description="选择或新建一个章节开始写作" :image-size="70" />
            </el-tab-pane>
          </el-tabs>
        </el-card>
      </el-col>

      <!-- 右侧：绑定本小说的 AI 对话 -->
      <el-col :md="9" class="chat-col">
        <el-card class="chat-card" shadow="never">
          <div class="chat-toolbar">
            <el-select
              v-model="activeSessionId"
              placeholder="选择对话"
              style="flex: 1"
              @change="onSelectSession"
            >
              <el-option v-for="s in sessions" :key="s.id" :label="s.title" :value="s.id" />
            </el-select>
            <el-button type="primary" plain :loading="creatingSession" @click="createSession">
              ＋ 新对话
            </el-button>
          </div>

          <template v-if="activeSession">
            <div ref="messageListEl" class="chat-messages">
              <el-empty
                v-if="!messages.length"
                description="用一句话描述你的创作需求，或上传小说文本提取风格"
                :image-size="70"
              />
              <div v-for="message in messages" :key="message.id" class="msg-row" :class="message.role.toLowerCase()">
                <div class="bubble">
                  <div v-for="(att, i) in message.attachments ?? []" :key="i" class="att-chip">
                    📎 {{ att.name }}（{{ att.chars }} 字）
                  </div>
                  <div class="msg-text">{{ message.content }}</div>

                  <div v-if="message.toolCall" class="tool-card">
                    <div class="tool-head">
                      <el-tag size="small" :type="message.toolCall.status === 'SUCCESS' ? 'success' : 'danger'">
                        {{ message.toolCall.pluginName }}
                      </el-tag>
                      <span v-if="message.toolCall.status === 'FAILED'" class="tool-error">
                        {{ message.toolCall.error }}
                      </span>
                    </div>

                    <template v-if="message.toolCall.resultKind === 'outline' && outlineOf(message)">
                      <div class="outline-title serif">{{ outlineOf(message)!.title }}</div>
                      <div class="outline-logline">{{ outlineOf(message)!.logline }}</div>
                      <el-collapse class="outline-collapse">
                        <el-collapse-item
                          v-for="ch in outlineOf(message)!.chapters"
                          :key="ch.no"
                          :title="`第${ch.no}章 ${ch.title}`"
                        >
                          <div>{{ ch.summary }}</div>
                        </el-collapse-item>
                      </el-collapse>
                      <el-button
                        size="small"
                        type="primary"
                        :loading="savingOutline[message.id]"
                        @click="saveOutline(message)"
                      >
                        保存到小说
                      </el-button>
                    </template>

                    <template v-else-if="message.toolCall.resultKind === 'stylePack'">
                      <el-button size="small" @click="$router.push('/styles')">去风格包页面查看</el-button>
                    </template>
                  </div>
                </div>
              </div>

              <div v-if="sending" class="msg-row assistant">
                <div class="bubble typing">
                  {{ progress > 0 ? `${progressMessage}（${progress}%）` : '正在思考…' }}
                </div>
              </div>
            </div>

            <div class="composer">
              <div v-if="attachment" class="composer-att">
                📎 {{ attachment.name }}（{{ attachment.text.length }} 字）
                <el-button link size="small" @click="attachment = null">移除</el-button>
              </div>
              <el-input
                v-model="input"
                type="textarea"
                :rows="3"
                maxlength="4000"
                placeholder="例如：帮我生成一个废柴逆袭的大纲；或上传 .txt 小说提取风格"
                :disabled="sending"
                @keydown.ctrl.enter.prevent="send"
              />
              <div class="composer-bar">
                <input ref="fileInputEl" type="file" accept=".txt,.md" hidden @change="onFileChange" />
                <el-button size="small" @click="fileInputEl?.click()" :disabled="sending">📎 附件</el-button>
                <el-radio-group v-model="modelMode" size="small" :disabled="sending">
                  <el-radio-button value="builtin">内置模型</el-radio-button>
                  <el-radio-button value="custom" :disabled="!modelConfigs.length">自定义</el-radio-button>
                </el-radio-group>
                <el-select
                  v-if="modelMode === 'custom'"
                  v-model="modelConfigId"
                  size="small"
                  style="width: 180px"
                  placeholder="选择模型配置"
                >
                  <el-option
                    v-for="m in modelConfigs"
                    :key="m.id"
                    :label="`${m.name}（${m.modelName}）`"
                    :value="m.id"
                  />
                </el-select>
                <div class="spacer" />
                <span class="hint">Ctrl+Enter 发送</span>
                <el-button type="primary" size="small" :loading="sending" :disabled="!canSend" @click="send">
                  发送
                </el-button>
              </div>
            </div>
          </template>
          <el-empty v-else description="新建一个对话开始创作" :image-size="70" />
        </el-card>
      </el-col>
    </el-row>
  </div>
  <div v-else class="page">
    <el-skeleton :rows="5" animated />
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import type { Context } from 'cordis'
import { del, get, post, put } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import {
  LIMITS,
  type ChapterDto,
  type ChapterStatus,
  type ChatMessageDto,
  type ChatSessionDto,
  type GenerationProgressPayload,
  type ModelConfigDto,
  type NovelDto,
  type OutlineStructure,
  type SendChatMessageResponse,
  type StylePackDto,
} from '@novelagent/shared'

const route = useRoute()
const auth = useAuthStore()
const bridgeCtx = inject<Context>('bridge')

const novelId = route.params.id as string
const genres = ['玄幻', '都市', '科幻', '武侠', '悬疑', '言情', '其他']

// ===== 小说信息 =====
const novel = ref<NovelDto | null>(null)
const stylePacks = ref<StylePackDto[]>([])
const novelForm = reactive({
  title: '',
  genre: '' as string,
  status: 'DRAFT' as NovelDto['status'],
  stylePackId: null as string | null,
  description: '',
})
const savingNovel = ref(false)
const activeTab = ref('info')

// ===== 章节 =====
const chapters = ref<ChapterDto[]>([])
const activeChapterId = ref('')
const editingChapter = ref<{
  id: string
  title: string
  status: ChapterStatus
  summary: string
  content: string
} | null>(null)
const savingChapter = ref(false)
const deletingChapter = ref(false)

// ===== AI 对话（绑定本小说） =====
const sessions = ref<ChatSessionDto[]>([])
const activeSessionId = ref('')
const activeSession = ref<ChatSessionDto | null>(null)
const messages = ref<ChatMessageDto[]>([])
const input = ref('')
const attachment = ref<{ name: string; text: string } | null>(null)
const sending = ref(false)
const progress = ref(0)
const progressMessage = ref('')
const modelConfigs = ref<ModelConfigDto[]>([])
const modelMode = ref<'builtin' | 'custom'>('builtin')
const modelConfigId = ref('')
const creatingSession = ref(false)
const savingOutline = ref<Record<string, boolean>>({})

const messageListEl = ref<HTMLElement>()
const fileInputEl = ref<HTMLInputElement>()

const stylePackGroups = computed(() => [
  { label: '内置风格包', options: stylePacks.value.filter((p) => p.sourceType === 'BUILTIN') },
  { label: '我的风格包', options: stylePacks.value.filter((p) => p.sourceType !== 'BUILTIN') },
])

const canSend = computed(
  () => !!activeSession.value && (!!input.value.trim() || !!attachment.value) &&
    (modelMode.value === 'builtin' || !!modelConfigId.value),
)

let offProgress: (() => void) | undefined

onMounted(async () => {
  if (bridgeCtx) {
    offProgress = bridgeCtx.on('generation-progress', (payload: GenerationProgressPayload) => {
      progress.value = payload.progress
      progressMessage.value = payload.message
    })
  }
  try {
    const [novelRes, packsRes, chaptersRes, sessionsRes, modelsRes] = await Promise.allSettled([
      get<NovelDto>(`/api/novels/${novelId}`),
      get<StylePackDto[]>('/api/style-packs'),
      get<ChapterDto[]>(`/api/novels/${novelId}/chapters`),
      get<ChatSessionDto[]>(`/api/chat/sessions?novelId=${novelId}`),
      get<ModelConfigDto[]>('/api/models/configs'),
    ])
    if (novelRes.status === 'rejected') throw novelRes.reason
    novel.value = novelRes.value
    Object.assign(novelForm, {
      title: novel.value.title,
      genre: novel.value.genre ?? '',
      status: novel.value.status,
      stylePackId: novel.value.stylePackId,
      description: novel.value.description ?? '',
    })
    if (packsRes.status === 'fulfilled') stylePacks.value = packsRes.value
    if (chaptersRes.status === 'fulfilled') chapters.value = chaptersRes.value
    if (sessionsRes.status === 'fulfilled') {
      sessions.value = sessionsRes.value
      if (sessions.value.length > 0) await onSelectSession(sessions.value[0].id)
    }
    if (modelsRes.status === 'fulfilled') modelConfigs.value = modelsRes.value
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
})

onUnmounted(() => offProgress?.())

// ===== 小说信息 =====

async function saveNovel() {
  if (!novelForm.title.trim()) {
    ElMessage.warning('请填写标题')
    return
  }
  savingNovel.value = true
  try {
    novel.value = await put<NovelDto>(`/api/novels/${novelId}`, { ...novelForm, genre: novelForm.genre || undefined })
    ElMessage.success('小说信息已保存')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    savingNovel.value = false
  }
}

// ===== 章节 =====

async function loadChapters(selectId?: string) {
  chapters.value = await get<ChapterDto[]>(`/api/novels/${novelId}/chapters`)
  if (chapters.value.length > 0) {
    const target = selectId ?? activeChapterId.value
    await onSelectChapter(target && chapters.value.some((c) => c.id === target) ? target : chapters.value[0].id)
  } else {
    activeChapterId.value = ''
    editingChapter.value = null
  }
}

function onSelectChapter(id: string) {
  const chapter = chapters.value.find((c) => c.id === id)
  activeChapterId.value = id
  editingChapter.value = chapter
    ? {
        id: chapter.id,
        title: chapter.title,
        status: chapter.status,
        summary: chapter.summary ?? '',
        content: chapter.content ?? '',
      }
    : null
}

async function createChapter() {
  const title = `第${chapters.value.length + 1}章`
  try {
    const chapter = await post<ChapterDto>(`/api/novels/${novelId}/chapters`, { title })
    await loadChapters(chapter.id)
    ElMessage.success('已新建章节')
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
}

async function saveChapter() {
  const chapter = editingChapter.value
  if (!chapter) return
  if (!chapter.title.trim()) {
    ElMessage.warning('请填写章节标题')
    return
  }
  savingChapter.value = true
  try {
    await put(`/api/novels/${novelId}/chapters/${chapter.id}`, {
      title: chapter.title,
      status: chapter.status,
      summary: chapter.summary || null,
      content: chapter.content,
    })
    await loadChapters(chapter.id)
    if (novel.value) novel.value = await get<NovelDto>(`/api/novels/${novelId}`)
    ElMessage.success('章节已保存')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    savingChapter.value = false
  }
}

async function removeChapter() {
  const chapter = editingChapter.value
  if (!chapter) return
  await ElMessageBox.confirm(`确定删除「${chapter.title}」吗？`, '删除确认', { type: 'warning' })
  deletingChapter.value = true
  try {
    await del(`/api/novels/${novelId}/chapters/${chapter.id}`)
    await loadChapters()
    if (novel.value) novel.value = await get<NovelDto>(`/api/novels/${novelId}`)
    ElMessage.success('章节已删除')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    deletingChapter.value = false
  }
}

// ===== AI 对话 =====

async function onSelectSession(id: string) {
  const session = sessions.value.find((s) => s.id === id)
  if (!session) return
  activeSessionId.value = id
  activeSession.value = session
  messages.value = await get<ChatMessageDto[]>(`/api/chat/sessions/${id}/messages`)
  scrollToBottom()
}

async function createSession() {
  creatingSession.value = true
  try {
    const session = await post<ChatSessionDto>('/api/chat/sessions', { novelId })
    sessions.value.unshift(session)
    await onSelectSession(session.id)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    creatingSession.value = false
  }
}

async function send() {
  const session = activeSession.value
  if (!session || sending.value || !canSend.value) return
  const content = input.value.trim()
  const att = attachment.value
  sending.value = true
  progress.value = 0
  // 乐观渲染用户消息
  messages.value.push({
    id: `local-${Date.now()}`,
    sessionId: session.id,
    role: 'USER',
    content,
    attachments: att ? [{ name: att.name, chars: att.text.length }] : null,
    toolCall: null,
    createdAt: new Date().toISOString(),
  })
  scrollToBottom()
  try {
    const result = await post<SendChatMessageResponse>(`/api/chat/sessions/${session.id}/messages`, {
      content,
      attachment: att ?? undefined,
      providerId: modelMode.value === 'builtin' ? 'builtin' : 'openai-model',
      modelConfigId: modelMode.value === 'builtin' ? undefined : modelConfigId.value,
    })
    messages.value[messages.value.length - 1] = result.userMessage
    messages.value.push(result.assistantMessage)
    input.value = ''
    attachment.value = null
    auth.fetchMe().catch(() => undefined) // 刷新积分显示
    session.title = result.userMessage.content.slice(0, 24)
  } catch (err) {
    messages.value.pop() // 回滚乐观消息
    ElMessage.error((err as Error).message)
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const text = await file.text()
  if (text.length > LIMITS.CHAT_ATTACHMENT_MAX_CHARS) {
    ElMessage.warning(`附件超过 ${LIMITS.CHAT_ATTACHMENT_MAX_CHARS} 字，将截断后使用`)
  }
  attachment.value = { name: file.name, text }
  target.value = ''
}

/** toolCall.result 形判为大纲结构（卡片渲染） */
function outlineOf(message: ChatMessageDto): OutlineStructure | null {
  const tc = message.toolCall
  if (tc?.resultKind !== 'outline' || !tc.result) return null
  const r = tc.result as Partial<OutlineStructure>
  return r.logline && Array.isArray(r.chapters) ? (r as OutlineStructure) : null
}

async function saveOutline(message: ChatMessageDto) {
  const session = activeSession.value
  const outline = outlineOf(message)
  if (!session?.novelId || !outline || !message.toolCall) return
  savingOutline.value[message.id] = true
  try {
    await post('/api/writing/outline/save', {
      novelId: session.novelId,
      structure: outline,
      generatedBy: message.toolCall.pluginId,
    })
    ElMessage.success('大纲已保存到小说')
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    savingOutline.value[message.id] = false
  }
}

function scrollToBottom() {
  nextTick(() => {
    messageListEl.value?.scrollTo({ top: messageListEl.value.scrollHeight, behavior: 'smooth' })
  })
}

function statusName(status: string): string {
  return { DRAFT: '草稿', ONGOING: '连载中', COMPLETED: '已完结', ARCHIVED: '已归档' }[status] ?? status
}

function statusType(status: string): string {
  return { DRAFT: 'info', ONGOING: 'success', COMPLETED: '', ARCHIVED: 'warning' }[status] ?? 'info'
}
</script>

<style scoped>
.editor-page {
  height: calc(100vh - 60px - 48px);
  max-width: none;
  display: flex;
  flex-direction: column;
}
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.editor-title-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.editor-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--ink-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.editor-wordcount {
  font-size: 12px;
  color: var(--ink-secondary);
}
.editor-layout {
  flex: 1;
  min-height: 0;
}
.edit-col,
.chat-col {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.edit-card,
.chat-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.edit-card :deep(.el-card__body),
.chat-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.edit-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.edit-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.info-form {
  max-width: 560px;
}

/* 章节编辑 */
.chapter-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.chapter-form {
  max-width: 720px;
}
.chapter-content :deep(textarea) {
  font-family: 'Noto Serif SC', serif;
  line-height: 1.9;
}
.chapter-save-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 14px;
}
.chapter-count {
  font-size: 12px;
  color: var(--ink-secondary);
}

/* AI 对话 */
.chat-toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 4px 4px 8px;
  min-height: 0;
}
.msg-row {
  display: flex;
  margin-bottom: 12px;
}
.msg-row.user {
  justify-content: flex-end;
}
.msg-row.assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 86%;
  padding: 9px 12px;
  border-radius: 12px;
  background: var(--card-bg);
  border: 1px solid var(--line-soft);
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-row.user .bubble {
  background: var(--accent-soft);
  border-color: #111111;
}
.msg-text {
  color: var(--ink-strong);
  font-size: 14px;
  line-height: 1.65;
}
.att-chip {
  font-size: 12px;
  color: var(--accent-deep);
  background: var(--paper-bg);
  border: 1px dashed var(--line-deep);
  border-radius: 6px;
  padding: 2px 8px;
  margin-bottom: 6px;
  display: inline-block;
}
.typing {
  color: var(--ink-secondary);
  font-size: 13px;
}
.tool-card {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line-soft);
  border-radius: 8px;
  background: var(--paper-bg);
}
.tool-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.tool-error {
  font-size: 12px;
  color: var(--el-color-danger);
}
.outline-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-strong);
}
.outline-logline {
  font-size: 13px;
  color: var(--ink-secondary);
  margin: 4px 0 8px;
}
.outline-collapse {
  margin-bottom: 10px;
  border-top: none;
}
.composer {
  border-top: 1px solid var(--line-soft);
  padding-top: 10px;
  margin-top: 8px;
}
.composer-att {
  font-size: 12px;
  color: var(--accent-deep);
  margin-bottom: 6px;
}
.composer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.composer-bar .spacer {
  flex: 1;
}
.hint {
  font-size: 12px;
  color: var(--ink-secondary);
}
</style>
