<script setup lang="ts">
import { Bot, Check, Copy, CornerDownLeft, ExternalLink, Loader2, Menu, Paperclip, Pencil, Plus, RotateCcw, Send, Share, Sparkles, Square, Trash2, User, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import AIChatExportImageDialog from '@/components/CodemirrorEditor/AIChatExportImageDialog.vue'
import ArticleToVideoComposer from '@/components/CodemirrorEditor/composers/ArticleToVideoComposer.vue'
import VideoToArticleComposer from '@/components/CodemirrorEditor/composers/VideoToArticleComposer.vue'
import PromptManager from '@/components/CodemirrorEditor/PromptManager.vue'
import ShareModePanel from '@/components/CodemirrorEditor/ShareModePanel.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cancelAIRequest, streamAIContent } from '@/services/ai'
import { buildChatAttachmentContext, CHAT_ATTACHMENT_ACCEPT, parseChatAttachment, type ParsedChatAttachment } from '@/services/chatAttachment'
import { chatDB, type ChatAttachmentRef, type ChatMessage, type ChatSession } from '@/utils/indexedDB'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  'submit': [value: string]
  'cancel': []
  'close': []
  'insertContent': [content: string]
  'clearCitations': []
}>()

type PendingAttachmentStatus = 'parsing' | 'ready' | 'error'

interface PendingAttachmentItem extends ParsedChatAttachment {
  status: PendingAttachmentStatus
  openUrl?: string
}

// 状态管理
const sessions = ref<ChatSession[]>([])
const currentSessionId = ref<string | null>(null)
const prompt = ref('')
const generating = ref(false)
const waitingForAIResponse = ref(false)
const sidebarCollapsed = ref(false)
const copiedMessageId = ref<string | null>(null)
const insertionButtonEnabled = ref(true)
const editingMessageId = ref<string | null>(null)
const editingMessageContent = ref('')
const exportImageDialogOpen = ref(false)
const messagesToExport = ref<ChatMessage[]>([])
const selectedMessages = ref<string[]>([])
const isShareMode = ref(false)
const citations = ref<string[]>([])
const showPromptManager = ref(false)
const showVideoComposer = ref(false)
const showArticleVideoComposer = ref(false)
const pendingAttachments = ref<PendingAttachmentItem[]>([])
const attachmentUploading = ref(false)

const mainInputRef = ref<any>(null)
const attachmentInputRef = ref<HTMLInputElement | null>(null)

// 计算属性
const currentSession = computed(() => {
  return sessions.value.find((s: ChatSession) => s.id === currentSessionId.value)
})

const currentMessages = computed(() => {
  return currentSession.value?.messages || []
})

const latestAssistantMessageContent = computed(() => {
  const latest = [...currentMessages.value]
    .reverse()
    .find(msg => msg.role === 'assistant' && msg.content.trim().length > 0)
  return latest?.content.trim() || ''
})

const hasPendingAttachments = computed(() => pendingAttachments.value.length > 0)

const canSendAction = computed(() => {
  if (generating.value) {
    return !!currentSessionId.value
  }
  if (editingMessageId.value) {
    return true
  }
  return !!prompt.value.trim() || hasPendingAttachments.value
})

const isAllSelected = computed(() => {
  return currentMessages.value.length > 0 && currentMessages.value.length === selectedMessages.value.length
})

const correspondingAIMessage = computed(() => {
  if (!editingMessageId.value || !currentSession.value)
    return null

  const editingMessageIndex = currentSession.value.messages.findIndex(m => m.id === editingMessageId.value)
  if (editingMessageIndex === -1)
    return null

  for (let i = editingMessageIndex + 1; i < currentSession.value.messages.length; i++) {
    if (currentSession.value.messages[i].role === 'assistant') {
      return currentSession.value.messages[i]
    }
    if (currentSession.value.messages[i].role === 'user') {
      break
    }
  }

  return null
})

const showPanel = computed({
  get: () => props.show,
  set: (value: boolean) => {
    if (!value && props.show) {
      citations.value = []
      isShareMode.value = false
      selectedMessages.value = []
      clearPendingAttachments()
    }
    emit('update:show', value)
  },
})

// 工具函数
function resetChatState() {
  isShareMode.value = false
  selectedMessages.value = []
  citations.value = []
  prompt.value = ''
  clearPendingAttachments()
}

function stopAIRequest() {
  if (generating.value) {
    cancelAIRequest()
    generating.value = false
    waitingForAIResponse.value = false
  }
}

function revokeSessionAttachmentOpenUrls(session: ChatSession) {
  session.messages.forEach((message) => {
    getMessageAttachments(message).forEach(attachment => revokeAttachmentOpenUrl(attachment.openUrl))
  })
}

// 创建新会话
async function createNewSession() {
  stopAIRequest()

  const newSession: ChatSession = {
    id: `session-${Date.now()}`,
    title: '新对话',
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  sessions.value.unshift(newSession)
  currentSessionId.value = newSession.id
  resetChatState()
  await saveSessions()

  // 通知父组件清空引文
  emit('clearCitations')
}

// 切换会话
function switchSession(sessionId: string) {
  stopAIRequest()
  currentSessionId.value = sessionId
  resetChatState()
}

// 删除会话
async function deleteSession(sessionId: string, event: Event) {
  event.stopPropagation()
  const index = sessions.value.findIndex((s: ChatSession) => s.id === sessionId)
  if (index > -1) {
    revokeSessionAttachmentOpenUrls(sessions.value[index])
    sessions.value.splice(index, 1)
    await chatDB.deleteSession(sessionId)
    if (currentSessionId.value === sessionId && sessions.value.length > 0) {
      currentSessionId.value = sessions.value[0].id
    }
  }
}

// 构建对话上下文
function buildContext(session: ChatSession, excludeMessageId?: string): string {
  let context = ''
  for (const msg of session.messages) {
    if (msg.id === excludeMessageId)
      continue

    const prefix = msg.role === 'user' ? '用户' : 'AI'
    context += `${prefix}: ${msg.content}\n`
  }
  return context
}

function triggerAttachmentUpload() {
  attachmentInputRef.value?.click()
}

function createAttachmentOpenUrl(file: File) {
  try {
    return URL.createObjectURL(file)
  }
  catch {
    return undefined
  }
}

function revokeAttachmentOpenUrl(openUrl?: string) {
  if (openUrl?.startsWith('blob:')) {
    URL.revokeObjectURL(openUrl)
  }
}

function getMessageAttachments(message: ChatMessage): ChatAttachmentRef[] {
  return ((message as ChatMessage & { attachments?: ChatAttachmentRef[] }).attachments || [])
}

function hasMessageAttachments(message: ChatMessage) {
  return getMessageAttachments(message).length > 0
}

async function isAttachmentUrlAvailable(openUrl: string) {
  if (!openUrl.startsWith('blob:')) {
    return true
  }

  try {
    const response = await fetch(openUrl)
    response.body?.cancel?.()
    return response.ok
  }
  catch {
    return false
  }
}

async function openMessageAttachment(attachment: ChatAttachmentRef) {
  if (!attachment.openUrl) {
    toast.warning('该附件无法直接打开，请重新上传后再查看。')
    return
  }

  const available = await isAttachmentUrlAvailable(attachment.openUrl)
  if (!available) {
    toast.warning('附件链接已失效，请重新上传后再打开。')
    return
  }

  const popup = window.open(attachment.openUrl, '_blank', 'noopener,noreferrer')
  if (popup) {
    return
  }

  const anchor = document.createElement('a')
  anchor.href = attachment.openUrl
  anchor.target = '_blank'
  anchor.rel = 'noopener noreferrer'
  anchor.click()
}

function removePendingAttachment(attachmentId: string) {
  const target = pendingAttachments.value.find(item => item.id === attachmentId)
  revokeAttachmentOpenUrl(target?.openUrl)
  pendingAttachments.value = pendingAttachments.value.filter(item => item.id !== attachmentId)
}

function clearPendingAttachments(revokeOpenUrls = true) {
  if (revokeOpenUrls) {
    pendingAttachments.value.forEach(item => revokeAttachmentOpenUrl(item.openUrl))
  }
  pendingAttachments.value = []
  if (attachmentInputRef.value) {
    attachmentInputRef.value.value = ''
  }
}

function createPendingAttachment(file: File): PendingAttachmentItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    name: file.name,
    mimeType: file.type || 'unknown',
    size: file.size,
    kind: 'unsupported',
    summary: '正在解析附件...',
    status: 'parsing',
    openUrl: createAttachmentOpenUrl(file),
  }
}

function patchPendingAttachment(
  attachmentId: string,
  updater: (attachment: PendingAttachmentItem) => PendingAttachmentItem,
) {
  const index = pendingAttachments.value.findIndex(item => item.id === attachmentId)
  if (index === -1) {
    return
  }
  pendingAttachments.value[index] = updater(pendingAttachments.value[index])
}

async function handleAttachmentFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) {
    return
  }

  const pendingItems = files.map(file => ({ file, pending: createPendingAttachment(file) }))
  pendingAttachments.value.push(...pendingItems.map(item => item.pending))
  attachmentUploading.value = true
  let successCount = 0

  try {
    for (const { file, pending } of pendingItems) {
      try {
        const parsed = await parseChatAttachment(file)
        patchPendingAttachment(pending.id, current => ({
          ...parsed,
          status: 'ready',
          openUrl: current.openUrl,
        }))
        successCount += 1
      }
      catch (error) {
        console.error(`附件解析失败: ${file.name}`, error)
        patchPendingAttachment(pending.id, (current) => ({
          ...current,
          name: file.name,
          mimeType: file.type || 'unknown',
          size: file.size,
          kind: 'unsupported',
          summary: '解析失败，已仅保留文件信息。',
          status: 'error',
        }))
      }
    }
  }
  finally {
    attachmentUploading.value = false
    input.value = ''
  }

  if (successCount > 0) {
    toast.success(`已添加 ${successCount} 个附件`)
  }
}

function getAttachmentTagText(attachment: PendingAttachmentItem) {
  if (attachment.status === 'parsing') {
    return `${attachment.name} · 解析中...`
  }

  const shortSummary = attachment.summary.length > 14
    ? `${attachment.summary.slice(0, 14)}...`
    : attachment.summary
  return `${attachment.name} · ${shortSummary}`
}

async function sendMessage() {
  const userPrompt = prompt.value.trim()
  if ((!userPrompt && !hasPendingAttachments.value)
    || generating.value
    || editingMessageId.value
    || attachmentUploading.value) {
    return
  }

  if (!currentSessionId.value) {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    sessions.value.unshift(newSession)
    currentSessionId.value = newSession.id
  }

  const session = sessions.value.find(s => s.id === currentSessionId.value)
  if (!session)
    return

  const basePrompt = userPrompt || '请根据我上传的附件内容进行分析。'
  const readyAttachments = pendingAttachments.value
    .filter(item => item.status !== 'parsing')

  const attachmentContext = buildChatAttachmentContext(
    readyAttachments.map(({ status, openUrl, ...attachment }) => attachment),
  )

  const sentAttachments: ChatAttachmentRef[] = readyAttachments.map(item => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    size: item.size,
    kind: item.kind,
    summary: item.summary,
    openUrl: item.openUrl,
  }))
  const finalPrompt = attachmentContext
    ? `${basePrompt}\n\n${attachmentContext}`
    : basePrompt

  const userMessage: ChatMessage & { attachments?: ChatAttachmentRef[] } = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: finalPrompt,
    timestamp: Date.now(),
    attachments: sentAttachments.length ? sentAttachments : undefined,
  }
  session.messages.push(userMessage)

  if (session.messages.length === 1) {
    session.title = basePrompt.substring(0, 20) + (basePrompt.length > 20 ? '...' : '')
  }
  session.updatedAt = Date.now()

  const fullContext = buildContext(session)

  prompt.value = ''
  citations.value = []
  clearPendingAttachments(false)

  generating.value = true
  waitingForAIResponse.value = true
  emit('submit', fullContext)
}

async function addAssistantMessage(content: string) {
  // 直接使用 find 获取会话，避免 computed 响应式延迟
  const session = sessions.value.find(s => s.id === currentSessionId.value)
  if (!session)
    return

  const lastMessage = session.messages[session.messages.length - 1]

  if (lastMessage && lastMessage.role === 'assistant' && generating.value) {
    lastMessage.content = content
  }
  else {
    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content,
      timestamp: Date.now(),
    }
    session.messages.push(assistantMessage)
  }

  session.updatedAt = Date.now()
  await saveSessions()

  if (waitingForAIResponse.value) {
    waitingForAIResponse.value = false
  }
}

// 插入内容到编辑器
function insertContent(content: string) {
  emit('insertContent', content)
}

function fallbackCopyText(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  let copied = false
  try {
    copied = document.execCommand('copy')
  }
  catch {
    copied = false
  }
  finally {
    document.body.removeChild(textarea)
  }

  return copied
}

async function copyTextWithFallback(text: string) {
  if (!text) {
    return false
  }

  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  }
  catch {
    // 忽略并回退到传统复制方案
  }

  return fallbackCopyText(text)
}

// 复制消息内容
async function copyMessage(message: ChatMessage) {
  const copied = await copyTextWithFallback(message.content)

  if (copied) {
    copiedMessageId.value = message.id
    setTimeout(() => {
      copiedMessageId.value = null
    }, 2000)
    return
  }

  console.error('复制失败: 无法访问剪贴板')
  toast.error('复制失败，请检查浏览器剪贴板权限')
}

// 保存会话
async function saveSessions() {
  try {
    await chatDB.saveSessions(sessions.value)
  }
  catch (error) {
    console.error('保存会话失败:', error)
  }
}

// 开始编辑消息
function startEditingMessage(message: ChatMessage) {
  editingMessageId.value = message.id
  editingMessageContent.value = message.content
  prompt.value = message.content

  if (message.role === 'user') {
    citations.value = [...extractCitations(message.content)]
  }
}

// 保存编辑的消息
async function saveEditedMessage() {
  if (!editingMessageId.value)
    return

  const session = sessions.value.find(s => s.id === currentSessionId.value)
  if (!session)
    return

  const messageIndex = session.messages.findIndex(m => m.id === editingMessageId.value)
  if (messageIndex === -1)
    return

  const editedMessage = session.messages[messageIndex]
  editedMessage.content = prompt.value || editingMessageContent.value
  session.updatedAt = Date.now()
  await saveSessions()

  if (editedMessage.role === 'user') {
    await regenerateResponseForEditedMessage(session, messageIndex, editedMessage)
    return
  }

  editingMessageId.value = null
  editingMessageContent.value = ''
  prompt.value = ''
  citations.value = []
  session.updatedAt = Date.now()
  saveSessions()
}

// 为编辑的用户消息重新生成 AI 响应
async function regenerateResponseForEditedMessage(
  session: ChatSession,
  messageIndex: number,
  editedMessage: ChatMessage,
) {
  let aiMessageIndex = -1
  if (messageIndex + 1 < session.messages.length) {
    const nextMessage = session.messages[messageIndex + 1]
    if (nextMessage.role === 'assistant') {
      aiMessageIndex = messageIndex + 1
    }
  }

  if (aiMessageIndex !== -1) {
    session.messages.splice(aiMessageIndex, 1)
  }

  const editedContent = prompt.value
  editingMessageId.value = null
  editingMessageContent.value = ''
  prompt.value = ''
  citations.value = []

  let fullContext = ''
  for (const msg of session.messages) {
    if (msg.id === editedMessage.id) {
      fullContext += `用户：${editedContent}\n`
      continue
    }
    if (msg.id === correspondingAIMessage.value?.id) {
      continue
    }
    const prefix = msg.role === 'user' ? '用户' : 'AI'
    fullContext += `${prefix}: ${msg.content}\n`
  }

  generating.value = true
  waitingForAIResponse.value = true

  try {
    let newAIContent = ''
    await streamAIContent({
      prompt: fullContext,
      onToken: (token) => {
        newAIContent += token
        if (waitingForAIResponse.value) {
          waitingForAIResponse.value = false
        }

        if (session.messages.length === messageIndex + 1
          || session.messages[messageIndex + 1]?.role !== 'assistant') {
          const assistantMessage: ChatMessage = {
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: newAIContent,
            timestamp: Date.now(),
          }
          session.messages.splice(messageIndex + 1, 0, assistantMessage)
        }
        else {
          session.messages[messageIndex + 1].content = newAIContent
        }
        saveSessions()
      },
      onError: async (error) => {
        console.error('AI 请求错误:', error)
        generating.value = false
        waitingForAIResponse.value = false

        const errorMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: `错误：${error.message || 'AI 请求失败'}`,
          timestamp: Date.now(),
        }
        session.messages.splice(messageIndex + 1, 0, errorMessage)
        await saveSessions()
      },
      onFinish: async () => {
        generating.value = false
        waitingForAIResponse.value = false
        session.updatedAt = Date.now()
        await saveSessions()
      },
    })
  }
  catch (error) {
    console.error('生成 AI 回复失败:', error)
    generating.value = false
    waitingForAIResponse.value = false
  }
}

// 处理发送或保存
function handleSendOrSave() {
  if (editingMessageId.value) {
    saveEditedMessage()
  }
  else if (generating.value) {
    handleCancelAIRequest()
  }
  else {
    sendMessage()
  }
}

// 重新生成 AI 回复
async function regenerateAIResponse(message: ChatMessage) {
  if (!currentSessionId.value)
    return

  const session = sessions.value.find(s => s.id === currentSessionId.value)
  if (!session)
    return

  const latestAIMessages = session.messages
    .filter(m => m.role === 'assistant')
    .sort((a, b) => b.timestamp - a.timestamp)

  const latestAIMessage = latestAIMessages[0]
  if (!latestAIMessage || latestAIMessage.id !== message.id)
    return

  const messageIndex = session.messages.findIndex(m => m.id === message.id)
  if (messageIndex <= 0)
    return

  let userMessageIndex = -1
  for (let i = messageIndex - 1; i >= 0; i--) {
    if (session.messages[i].role === 'user') {
      userMessageIndex = i
      break
    }
  }

  if (userMessageIndex === -1)
    return

  const userMessage = session.messages[userMessageIndex]

  generating.value = true
  waitingForAIResponse.value = true

  let fullContext = buildContext(session, message.id)
  const userQuestion = extractUserQuestion(userMessage.content) || userMessage.content
  fullContext += `用户：${userQuestion}\n`

  try {
    let newAIContent = ''
    await streamAIContent({
      prompt: fullContext,
      onToken: (token) => {
        newAIContent += token
        if (waitingForAIResponse.value) {
          waitingForAIResponse.value = false
        }
        session.messages[messageIndex].content = newAIContent
        saveSessions()
      },
      onError: (error) => {
        console.error('AI 请求错误:', error)
        generating.value = false
        waitingForAIResponse.value = false
      },
      onFinish: () => {
        generating.value = false
        waitingForAIResponse.value = false
        saveSessions()
      },
    })
  }
  catch (error) {
    console.error('重新生成 AI 回复失败:', error)
    generating.value = false
    waitingForAIResponse.value = false
  }
}

// 判断是否是最新 AI 消息
function isLatestAIMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant')
    return false

  const assistantMessages = currentMessages.value
    .filter(m => m.role === 'assistant')
    .sort((a, b) => b.timestamp - a.timestamp)

  return assistantMessages[0]?.id === message.id
}

// 判断是否是最新用户消息
function isLatestUserMessage(message: ChatMessage): boolean {
  if (message.role !== 'user')
    return false

  const userMessages = currentMessages.value
    .filter(m => m.role === 'user')
    .sort((a, b) => b.timestamp - a.timestamp)

  return userMessages[0]?.id === message.id
}

// 选择/取消选择消息
function toggleSelectMessage(message: ChatMessage) {
  const index = selectedMessages.value.indexOf(message.id)
  if (index > -1) {
    selectedMessages.value.splice(index, 1)
  }
  else {
    selectedMessages.value.push(message.id)
  }
}

// 导出选中的消息为长图
function exportSelectedMessagesAsImage() {
  if (selectedMessages.value.length > 0) {
    const selectedMsgs = currentMessages.value.filter(msg =>
      selectedMessages.value.includes(msg.id),
    )
    messagesToExport.value = selectedMsgs
    exportImageDialogOpen.value = true
  }
}

// 全选或取消全选
function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedMessages.value = []
  }
  else {
    selectedMessages.value = currentMessages.value.map(msg => msg.id)
  }
}

// 切换分享模式
function toggleShareMode() {
  isShareMode.value = !isShareMode.value
  if (!isShareMode.value) {
    selectedMessages.value = []
  }
}

// 取消 AI 请求
function handleCancelAIRequest() {
  stopAIRequest()
  emit('cancel')
}

// 滚动到底部
const messagesContainerRef = ref<HTMLElement | null>(null)
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainerRef.value) {
      messagesContainerRef.value.scrollTop = messagesContainerRef.value.scrollHeight
    }
  })
}

watch(currentMessages, () => {
  scrollToBottom()
}, { deep: true })

function handleClearCitations() {
  citations.value = []
}

function focusMainInput() {
  if (mainInputRef.value?.$el) {
    mainInputRef.value.$el.focus()
  }
  else if (mainInputRef.value) {
    (mainInputRef.value as any).focus()
  }
}

function toggleVideoComposerPanel() {
  showVideoComposer.value = !showVideoComposer.value
  if (showVideoComposer.value) {
    showArticleVideoComposer.value = false
  }
}

function toggleArticleVideoComposerPanel() {
  showArticleVideoComposer.value = !showArticleVideoComposer.value
  if (showArticleVideoComposer.value) {
    showVideoComposer.value = false
  }
}

interface ComposerApplyPayload {
  prompt: string
  autoSend: boolean
}

function handleComposerApply(payload: ComposerApplyPayload) {
  prompt.value = payload.prompt
  showVideoComposer.value = false
  showArticleVideoComposer.value = false

  nextTick(() => {
    if (payload.autoSend) {
      sendMessage()
      return
    }
    focusMainInput()
  })
}

// 暴露方法给父组件
defineExpose({
  updateAIOutput: (content: string) => {
    addAssistantMessage(content)
  },
  clearAIOutput: () => {
    if (currentSessionId.value) {
      const session = sessions.value.find(s => s.id === currentSessionId.value)
      const lastMessage = session?.messages[session.messages.length - 1]
      if (lastMessage && lastMessage.role === 'assistant') {
        lastMessage.content = ''
      }
    }
  },
  finishGenerating: () => {
    generating.value = false
  },
  startGenerating: () => {
    generating.value = true
  },
  clearPrompt: () => {
    prompt.value = ''
  },
  enableInsertionButton: () => {
    insertionButtonEnabled.value = true
  },
  disableInsertionButton: () => {
    insertionButtonEnabled.value = false
  },
  createNewSession: async () => {
    await createNewSession()
  },
  setCitations: (citationArray: string[]) => {
    citations.value = [...citationArray]
  },
  addCitation: (citation: string) => {
    citations.value.push(citation)
  },
  clearCitations: () => {
    citations.value = []
  },
  extractUserPart,
  extractCitations,
  extractUserQuestion,
})

// 初始化：加载历史会话
let hasLoadedSessions = false
async function initializeSessions() {
  if (hasLoadedSessions)
    return

  try {
    const loadedSessions = await chatDB.getAllSessions()
    // 合并加载的会话和现有会话，避免覆盖临时会话
    const existingIds = new Set(sessions.value.map(s => s.id))
    const newSessions = loadedSessions.filter(s => !existingIds.has(s.id))
    sessions.value = [...newSessions, ...sessions.value]
    console.log(`从 indexedDB 加载了 ${loadedSessions.length} 个会话`)
    hasLoadedSessions = true
  }
  catch (error) {
    console.error('加载会话失败:', error)
  }
}

// 监听显示状态变化
watch(() => props.show, async (newShow, oldShow) => {
  // 只在从隐藏变为显示时加载
  if (newShow && !oldShow) {
    await initializeSessions()
    stopAIRequest()
  }
}, { immediate: true })

onMounted(async () => {
  await initializeSessions()
})

function extractUserPart(content: string): string {
  return content
}

function extractCitations(content: string): string[] {
  const citationRegex = /\[引文 (\d+)\]:\s*([^\r\n]+)/g
  const citations: string[] = []

  for (const match of content.matchAll(citationRegex)) {
    citations.push(match[2].replace(/\r?\n/g, ' ').trim())
  }

  return citations
}

function extractUserQuestion(content: string): string {
  const userQuestionIndex = content.indexOf('用户问题:')
  if (userQuestionIndex !== -1) {
    let questionContent = content.substring(userQuestionIndex + 5).trim()
    if (questionContent.startsWith(':')) {
      questionContent = questionContent.substring(1).trim()
    }
    return questionContent
  }
  return ''
}

function parseMessageContent(content: string) {
  const userQuestionIndex = content.indexOf('用户问题:')
  if (userQuestionIndex !== -1) {
    const citationPart = content.substring(0, userQuestionIndex)
    const questionPart = content.substring(userQuestionIndex + 5)

    const parts: Array<{ type: 'citation' | 'text', text: string }> = []
    const citationRegex = /\[引文 (\d+)\]:\s*([^\r\n]+)/g
    let citationLastIndex = 0

    for (const citationMatch of citationPart.matchAll(citationRegex)) {
      if (citationMatch.index > citationLastIndex) {
        const textBefore = citationPart.slice(citationLastIndex, citationMatch.index)
        if (textBefore.trim()) {
          parts.push({ type: 'text', text: textBefore })
        }
      }

      parts.push({ type: 'citation', text: `[引文${citationMatch[1]}]` })

      if (citationMatch[2].trim()) {
        parts.push({ type: 'text', text: `${citationMatch[2]} ` })
      }

      citationLastIndex = citationMatch.index + citationMatch[0].length
    }

    if (citationLastIndex < citationPart.length) {
      const remainingText = citationPart.slice(citationLastIndex)
      if (remainingText.trim()) {
        parts.push({ type: 'text', text: remainingText })
      }
    }

    parts.push({ type: 'text', text: '用户问题：' })
    parts.push({ type: 'text', text: questionPart })

    return parts
  }
  else {
    const citationRegex = /\[引文 (\d+)\]:\s*([^\r\n]+)/g
    const parts: Array<{ type: 'citation' | 'text', text: string }> = []

    let lastIndex = 0

    for (const match of content.matchAll(citationRegex)) {
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index)
        if (textBefore) {
          parts.push({ type: 'text', text: textBefore })
        }
      }

      parts.push({ type: 'citation', text: `[引文${match[1]}]` })

      if (match[2].trim()) {
        parts.push({ type: 'text', text: `${match[2]} ` })
      }

      lastIndex = match.index + match[0].length
    }

    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex)
      if (remainingText) {
        parts.push({ type: 'text', text: remainingText })
      }
    }

    if (parts.length === 0) {
      parts.push({ type: 'text', text: content })
    }

    return parts
  }
}

function handlePromptSelect(selectedPrompt: { content: string }) {
  prompt.value = selectedPrompt.content
  nextTick(() => {
    if (mainInputRef.value?.$el) {
      mainInputRef.value.$el.focus()
    }
    else if (mainInputRef.value) {
      (mainInputRef.value as any).focus()
    }
  })
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (editingMessageId.value) {
      saveEditedMessage()
    }
    else {
      sendMessage()
    }
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as HTMLElement
  const isClickInsideInput = target.closest('.input-area-container') !== null
  const isClickOnEditButton = target.closest('[data-edit-button]') !== null

  if (!isClickInsideInput && !isClickOnEditButton && editingMessageId.value) {
    editingMessageId.value = null
    editingMessageContent.value = ''
    prompt.value = ''
    citations.value = []
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  clearPendingAttachments()
  sessions.value.forEach(session => revokeSessionAttachmentOpenUrls(session))
})
</script>

<template>
  <div v-if="showPanel" class="ai-chat-panel bg-background fixed inset-0 z-50 flex">
    <!-- 侧边栏 -->
    <div
      class="sidebar flex flex-col border-r transition-all duration-300"
      :class="sidebarCollapsed ? 'w-0 overflow-hidden' : 'w-64'"
    >
      <!-- 侧边栏头部 -->
      <div class="flex items-center justify-between border-b p-3">
        <span v-if="!sidebarCollapsed" class="font-semibold">对话历史</span>
        <div class="flex gap-1">
          <Button v-if="!sidebarCollapsed" variant="ghost" size="sm" class="h-8 w-8 p-0" @click="createNewSession">
            <Plus class="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="sidebarCollapsed = !sidebarCollapsed">
            <Menu class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- 会话列表 -->
      <div v-if="!sidebarCollapsed" class="flex-1 overflow-y-auto p-2">
        <div
          v-for="session in sessions" :key="session.id"
          class="group hover:bg-accent mb-1 flex cursor-pointer items-center justify-between rounded px-2 py-2"
          :class="currentSessionId === session.id ? 'bg-accent' : ''" @click="switchSession(session.id)"
        >
          <div class="flex-1 truncate text-sm">
            {{ session.title }}
          </div>
          <Button
            variant="ghost" size="sm" class="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            @click="deleteSession(session.id, $event)"
          >
            <Trash2 class="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>

    <!-- 主内容区域 -->
    <div class="min-h-0 flex flex-1 flex-col">
      <!-- 顶部工具栏 -->
      <div class="flex shrink-0 items-center justify-between border-b p-3">
        <div class="flex items-center gap-2">
          <Button
            v-if="sidebarCollapsed" variant="ghost" size="sm" class="h-8 w-8 p-0"
            @click="sidebarCollapsed = false"
          >
            <Menu class="h-4 w-4" />
          </Button>
          <span class="font-semibold">AI 智能助手</span>
        </div>
        <div class="flex items-center gap-2">
          <Button :variant="showVideoComposer ? 'secondary' : 'ghost'" size="sm" @click="toggleVideoComposerPanel">
            视频转文
          </Button>
          <Button :variant="showArticleVideoComposer ? 'secondary' : 'ghost'" size="sm" @click="toggleArticleVideoComposerPanel">
            文转视频
          </Button>
          <Button variant="ghost" size="sm" @click="showPromptManager = true">
            <Sparkles class="mr-1 h-4 w-4" />
            提示词
          </Button>
          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click="emit('close')">
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>

      <!-- 对话消息区域 -->
      <div ref="messagesContainerRef" class="min-h-0 flex-1 overflow-y-auto p-4">
        <div v-if="currentMessages.length === 0" class="text-muted-foreground h-full flex items-center justify-center">
          <div class="text-center">
            <Bot class="mx-auto mb-4 h-12 w-12 opacity-50" />
            <p>开始新的对话</p>
            <p class="text-sm">
              直接输入您的问题
            </p>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="message in currentMessages" :key="message.id" class="flex items-start gap-3"
            :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
          >
            <!-- 选择复选框 -->
            <input
              v-if="currentMessages.length > 0 && isShareMode" type="checkbox" :checked="selectedMessages.includes(message.id)"
              class="mt-2" @change="toggleSelectMessage(message)"
            >

            <!-- 用户消息 -->
            <div v-if="message.role === 'user'" class="max-w-[80%] flex flex-row-reverse items-start gap-3">
              <div class="bg-secondary h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full">
                <User class="h-4 w-4" />
              </div>
              <div class="bg-secondary inline-block rounded-lg px-4 py-2">
                <div v-if="editingMessageId === message.id" class="whitespace-pre-wrap break-words text-sm opacity-50">
                  {{ message.content }}
                </div>
                <div v-else class="whitespace-pre-wrap break-words text-sm">
                  <div v-for="(part, index) in parseMessageContent(message.content)" :key="index" class="inline">
                    <span v-if="part.type === 'citation'" class="mr-1 text-blue-600 font-medium dark:text-blue-300">
                      {{ part.text }}
                    </span>
                    <span v-else>{{ part.text }}</span>
                  </div>
                </div>

                <div v-if="hasMessageAttachments(message)" class="mt-2 space-y-1">
                  <div
                    v-for="attachment in getMessageAttachments(message)"
                    :key="attachment.id"
                    class="bg-background/70 flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                  >
                    <div class="min-w-0 flex items-center gap-1">
                      <Paperclip class="h-3 w-3 shrink-0" />
                      <span class="truncate">{{ attachment.name }}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-6 px-2 text-xs"
                      @click="openMessageAttachment(attachment)"
                    >
                      <ExternalLink class="mr-1 h-3 w-3" />
                      打开
                    </Button>
                  </div>
                </div>

                <!-- 用户消息操作按钮 -->
                <div class="mt-2 flex items-center gap-2 -ml-2">
                  <Button
                    v-if="isLatestUserMessage(message) && !editingMessageId"
                    variant="ghost"
                    size="sm"
                    class="h-6 px-2 text-xs"
                    data-edit-button
                    @click="startEditingMessage(message)"
                  >
                    <Pencil class="h-3 w-3" />
                    编辑
                  </Button>
                  <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" @click="copyMessage(message)">
                    <Copy v-if="copiedMessageId !== message.id" class="h-3 w-3" />
                    <Check v-else class="h-3 w-3" />
                    {{ copiedMessageId === message.id ? '已复制' : '复制' }}
                  </Button>
                  <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" @click="toggleShareMode">
                    <Share class="h-3 w-3" />
                    分享
                  </Button>
                </div>
              </div>
            </div>

            <!-- AI 消息 -->
            <div v-else class="max-w-[80%] flex items-start gap-3">
              <div class="bg-secondary h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full">
                <Bot class="h-4 w-4" />
              </div>
              <div
                class="bg-secondary inline-block rounded-lg px-4 py-2"
                :class="{ 'blur-sm hover:blur-none transition-all duration-300': correspondingAIMessage && correspondingAIMessage.id === message.id }"
              >
                <div class="whitespace-pre-wrap break-words text-sm">
                  {{ message.content }}
                  <span
                    v-if="generating && message === currentMessages[currentMessages.length - 1]"
                    class="blinking-cursor"
                  >|</span>
                </div>
                <!-- AI 消息操作按钮 -->
                <div class="mt-2 flex items-center gap-2 -ml-2">
                  <Button
                    v-if="isLatestAIMessage(message)" variant="ghost" size="sm" class="h-6 px-2 text-xs"
                    @click="regenerateAIResponse(message)"
                  >
                    <RotateCcw class="h-3 w-3" />
                    重新生成
                  </Button>
                  <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" @click="copyMessage(message)">
                    <Copy v-if="copiedMessageId !== message.id" class="h-3 w-3" />
                    <Check v-else class="h-3 w-3" />
                    {{ copiedMessageId === message.id ? '已复制' : '复制' }}
                  </Button>
                  <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" @click="toggleShareMode">
                    <Share class="h-3 w-3" />
                    分享
                  </Button>
                  <Button
                    variant="ghost" size="sm" class="h-6 px-2 text-xs" :disabled="!insertionButtonEnabled"
                    @click="insertContent(message.content)"
                  >
                    <CornerDownLeft class="h-3 w-3" />
                    插入
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <!-- 等待 AI 响应的加载动画 -->
          <div
            v-if="waitingForAIResponse"
            class="flex items-start justify-start gap-3"
          >
            <div class="bg-secondary h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full">
              <Bot class="h-4 w-4" />
            </div>
            <div class="bg-secondary inline-block rounded-lg px-4 py-2">
              <div class="flex items-center">
                <div class="space-x-1 flex">
                  <div class="animate-bounce h-2 w-2 rounded-full bg-blue-500" style="animation-delay: 0ms;" />
                  <div class="animate-bounce h-2 w-2 rounded-full bg-blue-500" style="animation-delay: 150ms;" />
                  <div class="animate-bounce h-2 w-2 rounded-full bg-blue-500" style="animation-delay: 300ms;" />
                </div>
                <span class="text-muted-foreground ml-2 text-sm">AI 正在思考...</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域和工具栏 -->
      <div class="input-area-container shrink-0">
        <!-- 分享模式组件 -->
        <ShareModePanel
          v-if="isShareMode"
          :messages="currentMessages"
          :selected-messages="selectedMessages"
          @toggle-message-selection="toggleSelectMessage"
          @toggle-select-all="toggleSelectAll"
          @export-selected="exportSelectedMessagesAsImage"
          @exit-share-mode="toggleShareMode"
        />

        <!-- 输入框和工具栏（仅在非分享模式下显示） -->
        <div v-else class="flex flex-col border-t">
          <!-- 引文显示区域 -->
          <VideoToArticleComposer
            v-if="showVideoComposer"
            @apply="handleComposerApply"
          />

          <ArticleToVideoComposer
            v-if="showArticleVideoComposer"
            :latest-assistant-content="latestAssistantMessageContent"
            @apply="handleComposerApply"
          />

          <input
            ref="attachmentInputRef"
            type="file"
            :accept="CHAT_ATTACHMENT_ACCEPT"
            multiple
            class="hidden"
            @change="handleAttachmentFileChange"
          >

          <div v-if="citations.length > 0" class="bg-muted border-b p-3">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-medium">引用内容 ({{ citations.length }})</span>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 w-6 p-0"
                @click="handleClearCitations"
              >
                <X class="h-3 w-3" />
              </Button>
            </div>
            <div class="space-y-2 max-h-32 overflow-y-auto">
              <div
                v-for="(citation, index) in citations"
                :key="`current-citation-${index}`"
                class="bg-background border rounded-md p-2 text-xs"
              >
                <div class="flex items-start">
                  <span class="mr-2 text-xs text-blue-600 font-medium dark:text-blue-300">[引文{{ index + 1 }}]</span>
                  <span class="flex-1 break-words">{{ citation }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 输入框 -->
          <div v-if="hasPendingAttachments" class="bg-muted border-b px-3 py-2">
            <div class="mb-2 flex items-center justify-between">
              <span class="text-sm font-medium">待发送附件 ({{ pendingAttachments.length }})</span>
              <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" @click="clearPendingAttachments">
                清空
              </Button>
            </div>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="attachment in pendingAttachments"
                :key="attachment.id"
                class="bg-background flex items-center gap-1 border rounded-md px-2 py-1 text-xs"
              >
                <Loader2
                  v-if="attachment.status === 'parsing'"
                  class="h-3 w-3 animate-spin text-blue-500"
                />
                <span
                  class="max-w-[220px] truncate"
                  :class="{
                    'text-muted-foreground': attachment.status === 'parsing',
                    'text-red-500': attachment.status === 'error',
                  }"
                >
                  {{ getAttachmentTagText(attachment) }}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-5 w-5 p-0"
                  @click="removePendingAttachment(attachment.id)"
                >
                  <X class="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          <div class="flex-1">
            <Textarea
              ref="mainInputRef"
              v-model="prompt" placeholder="输入您的问题或需求..." :rows="2"
              class="w-full resize-none border-0 placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0"
              :disabled="generating" @keydown="handleKeyDown"
            />
          </div>

          <!-- 工具栏 -->
          <div class="space-x-2 flex justify-end px-4 pb-4">
            <Button
              variant="ghost"
              size="sm"
              class="h-8 w-8 p-0"
              :disabled="generating || editingMessageId !== null || attachmentUploading"
              @click="triggerAttachmentUpload"
            >
              <Paperclip class="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm" class="h-8 w-8 p-0"
              :disabled="!canSendAction || attachmentUploading"
              data-send-button
              @click="handleSendOrSave"
            >
              <Send v-if="!generating && !editingMessageId" class="h-4 w-4" />
              <Send v-else-if="!generating && editingMessageId" class="h-4 w-4" />
              <Square v-else class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 导出长图对话框 -->
    <AIChatExportImageDialog
      :show="exportImageDialogOpen"
      :messages="messagesToExport"
      :selected-message-ids="Array.from(selectedMessages)"
      @update:show="exportImageDialogOpen = $event"
    />

    <!-- 提示词管理器 -->
    <PromptManager
      :open="showPromptManager"
      @update:open="showPromptManager = $event"
      @select="handlePromptSelect"
    />
  </div>
</template>

<style scoped>
/* 闪烁光标 */
.blinking-cursor {
  display: inline-block;
  width: 1ch;
  animation: blink 1s infinite;
  vertical-align: baseline;
  background-color: currentColor;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0;
  }
}

/* 分享模式遮罩 */
.share-overlay {
  position: absolute;
  z-index: 50;
  background-color: var(--background);
  backdrop-filter: blur(4px);
  padding: 1rem;
}

/* 加载动画 */
@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.animate-bounce {
  animation: bounce 1s infinite;
}
</style>
