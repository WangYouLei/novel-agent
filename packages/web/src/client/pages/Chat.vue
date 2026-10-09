<template>
  <div class="page chat-page">
    <el-row :gutter="16" class="chat-layout">
      <!-- 左栏：会话列表 -->
      <el-col :md="6" class="session-col">
        <el-button type="primary" class="new-btn" @click="openCreateDialog">＋ 新建对话</el-button>
        <div class="session-list">
          <div
            v-for="s in sessions"
            :key="s.id"
            class="session-item"
            :class="{ active: s.id === activeSession?.id }"
            @click="openSession(s)"
          >
            <div class="session-title">{{ s.title }}</div>
            <div class="session-novel">{{ s.novelTitle ? `《${s.novelTitle}》` : '未关联小说' }}</div>
          </div>
          <el-empty v-if="!sessions.length" description="还没有对话" :image-size="60" />
        </div>
      </el-col>

      <!-- 右侧：消息流 + 输入区 -->
      <el-col :md="18">
        <el-card class="chat-card" shadow="never">
          <template v-if="activeSession">
            <div ref="messageListEl" class="chat-messages">
              <el-empty
                v-if="!messages.length"
                description="用一句话描述你的创作需求，或上传小说文本提取风格"
                :image-size="80"
              />
              <div v-for="message in messages" :key="message.id" class="msg-row" :class="message.role.toLowerCase()">
                <div class="bubble">
                  <!-- 附件摘要 -->
                  <div v-for="(att, i) in message.attachments ?? []" :key="i" class="att-chip">
                    📎 {{ att.name }}（{{ att.chars }} 字）
                  </div>
                  <div class="msg-text">{{ message.content }}</div>

                  <!-- 插件结果卡片 -->
                  <div v-if="message.toolCall" class="tool-card">
                    <div class="tool-head">
                      <el-tag size="small" :type="message.toolCall.status === 'SUCCESS' ? 'success' : 'danger'">
                        {{ message.toolCall.pluginName }}
                      </el-tag>
                      <span v-if="message.toolCall.status === 'FAILED'" class="tool-error">
                        {{ message.toolCall.error }}
                      </span>
                    </div>

                    <!-- 大纲卡片 -->
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

                    <!-- 风格包卡片 -->
                    <template v-else-if="message.toolCall.resultKind === 'stylePack'">
                      <el-button size="small" @click="$router.push('/styles')">去风格包页面查看</el-button>
                    </template>
                  </div>
                </div>
              </div>

              <!-- 生成中状态 -->
              <div v-if="sending" class="msg-row assistant">
                <div class="bubble typing">
                  {{ progress > 0 ? `${progressMessage}（${progress}%）` : '正在思考…' }}
                </div>
              </div>
            </div>

            <!-- 输入区 -->
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
                  style="width: 200px"
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
                <el-button type="primary" :loading="sending" :disabled="!canSend" @click="send">
                  发送
                </el-button>
              </div>
            </div>
          </template>
          <el-empty v-else description="新建一个对话开始创作" :image-size="90" />
        </el-card>
      </el-col>
    </el-row>

    <!-- 新建对话 -->
    <el-dialog v-model="createDialog" title="新建对话" width="420px">
      <el-form label-position="top">
        <el-form-item label="关联小说" required>
          <el-select v-model="createNovelId" style="width: 100%" placeholder="选择小说（大纲等生成会保存到该小说）">
            <el-option v-for="n in novels" :key="n.id" :label="n.title" :value="n.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!createNovelId" :loading="creating" @click="createSession">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { Context } from 'cordis'
import { get, post } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import {
  LIMITS,
  type ChatMessageDto,
  type ChatSessionDto,
  type ModelConfigDto,
  type NovelDto,
  type OutlineStructure,
  type SendChatMessageResponse,
  type GenerationProgressPayload,
} from '@novelagent/shared'

const auth = useAuthStore()
const bridgeCtx = inject<Context>('bridge')

const sessions = ref<ChatSessionDto[]>([])
const activeSession = ref<ChatSessionDto | null>(null)
const messages = ref<ChatMessageDto[]>([])
const input = ref('')
const attachment = ref<{ name: string; text: string } | null>(null)
const sending = ref(false)
const progress = ref(0)
const progressMessage = ref('')

const novels = ref<NovelDto[]>([])
const modelConfigs = ref<ModelConfigDto[]>([])
const modelMode = ref<'builtin' | 'custom'>('builtin')
const modelConfigId = ref('')

const createDialog = ref(false)
const createNovelId = ref('')
const creating = ref(false)

const messageListEl = ref<HTMLElement>()
const fileInputEl = ref<HTMLInputElement>()
const savingOutline = ref<Record<string, boolean>>({})

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
    // allSettled：任一请求失败不拖垮其余数据（否则 novels 连坐为空，误报"未创建小说"）
    const [sessionsRes, novelsRes, modelsRes] = await Promise.allSettled([
      get<ChatSessionDto[]>('/api/chat/sessions'),
      get<NovelDto[]>('/api/novels'),
      get<ModelConfigDto[]>('/api/models/configs'),
    ])
    if (sessionsRes.status === 'fulfilled') sessions.value = sessionsRes.value
    if (novelsRes.status === 'fulfilled') novels.value = novelsRes.value
    if (modelsRes.status === 'fulfilled') modelConfigs.value = modelsRes.value
    const failed = [sessionsRes, novelsRes, modelsRes].find((r) => r.status === 'rejected')
    if (failed) throw (failed as PromiseRejectedResult).reason
    if (sessions.value.length > 0) await openSession(sessions.value[0])
  } catch (err) {
    ElMessage.error((err as Error).message)
  }
})

onUnmounted(() => offProgress?.())

async function openSession(session: ChatSessionDto) {
  activeSession.value = session
  messages.value = await get<ChatMessageDto[]>(`/api/chat/sessions/${session.id}/messages`)
  scrollToBottom()
}

async function openCreateDialog() {
  // 每次打开前重新拉取，避免挂载后（如其他标签页）新建的小说不可见
  try {
    novels.value = await get<NovelDto[]>('/api/novels')
  } catch (err) {
    ElMessage.error((err as Error).message)
    return
  }
  if (novels.value.length === 0) {
    ElMessage.warning(
      `当前账号「${auth.user?.username ?? '未知'}」下还没有小说，请先到「小说管理」创建一本（小说按登录账号隔离，注意右上角当前登录的用户名）`,
    )
    return
  }
  createNovelId.value = novels.value[0].id
  createDialog.value = true
}

async function createSession() {
  creating.value = true
  try {
    const session = await post<ChatSessionDto>('/api/chat/sessions', { novelId: createNovelId.value })
    sessions.value.unshift(session)
    createDialog.value = false
    await openSession(session)
  } catch (err) {
    ElMessage.error((err as Error).message)
  } finally {
    creating.value = false
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
    // 刷新会话标题
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
</script>

<style scoped>
.chat-page {
  height: calc(100vh - 60px - 48px);
  max-width: none;
}
.chat-layout {
  height: 100%;
}
.session-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}
.new-btn {
  width: 100%;
}
.session-list {
  flex: 1;
  overflow-y: auto;
  background: var(--card-bg);
  border: 1px solid var(--line-soft);
  border-radius: 10px;
  padding: 8px;
}
.session-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.session-item:hover {
  background: var(--el-fill-color-light);
}
.session-item.active {
  background: var(--accent-soft);
}
.session-title {
  font-weight: 600;
  color: var(--ink-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-novel {
  font-size: 12px;
  color: var(--ink-secondary);
  margin-top: 2px;
}

.chat-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.chat-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-bottom: 12px;
}
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}
.msg-row {
  display: flex;
  margin-bottom: 14px;
}
.msg-row.user {
  justify-content: flex-end;
}
.msg-row.assistant {
  justify-content: flex-start;
}
.bubble {
  max-width: 78%;
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--card-bg);
  border: 1px solid var(--line-soft);
  white-space: pre-wrap;
  word-break: break-word;
}
.msg-row.user .bubble {
  background: var(--accent-soft);
  border-color: #e2cba4;
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
  border: 1px dashed #d5c39d;
  border-radius: 6px;
  padding: 2px 8px;
  margin-bottom: 6px;
  display: inline-block;
}
.typing {
  color: var(--ink-secondary);
  font-size: 13px;
}

/* 插件结果卡片 */
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
}
.tool-error {
  font-size: 12px;
  color: var(--el-color-danger);
}
.outline-title {
  font-size: 16px;
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

/* 输入区 */
.composer {
  border-top: 1px solid var(--line-soft);
  padding-top: 12px;
}
.composer-att {
  font-size: 12px;
  color: var(--accent-deep);
  margin-bottom: 6px;
}
.composer-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.composer-bar .spacer {
  flex: 1;
}
.hint {
  font-size: 12px;
  color: var(--ink-secondary);
}
</style>
