<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import AISwitchBox from '@/components/CodemirrorEditor/EditorHeader/AISwitchBox.vue'
import AIChatPanel from '@/components/CodemirrorEditor/AIChatPanel.vue'
import { Toaster } from '@/components/ui/sonner'
import { insertHtmlModeContent } from '@/html-mode/tiptap-appmsg-editor/js/insert-content'
import { streamAIContent } from '@/services/ai'
import { useAIStore } from '@/stores'

type ChatPrompt = string | Array<{ role: string, content: string }>

const aiStore = useAIStore()
const aiChatPanelRef = ref<InstanceType<typeof AIChatPanel> | null>(null)
const currentRequestId = ref<string | null>(null)

function hasAIConfiguration() {
  const activeConfiguration = aiStore.activeConfiguration
  return !!(
    activeConfiguration?.apiKey?.trim()
    && activeConfiguration?.apiDomain?.trim()
    && activeConfiguration?.model?.trim()
  )
}

function finishPanelGeneration() {
  aiStore.setGenerating(false)
  aiChatPanelRef.value?.finishGenerating()
  aiChatPanelRef.value?.enableInsertionButton()
}

async function handleSubmit(prompt: ChatPrompt) {
  if (!hasAIConfiguration()) {
    toast.error('请先配置AI助手')
    aiStore.settingsDialogVisible = true
    finishPanelGeneration()
    return
  }

  const requestId = `html-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  currentRequestId.value = requestId
  let generatedContent = ''

  await streamAIContent({
    prompt,
    onToken: (token) => {
      if (currentRequestId.value !== requestId) {
        return
      }

      generatedContent += token
      aiChatPanelRef.value?.updateAIOutput(generatedContent)
    },
    onError: (error) => {
      if (currentRequestId.value !== requestId) {
        return
      }

      toast.error(`AI请求失败: ${error.message || '请稍后重试'}`)
      finishPanelGeneration()
    },
    onFinish: () => {
      if (currentRequestId.value !== requestId) {
        return
      }

      finishPanelGeneration()
    },
  })
}

function handleCancel() {
  currentRequestId.value = null
  finishPanelGeneration()
}

function handleInsertContent(content: string) {
  const inserted = insertHtmlModeContent(content)
  if (!inserted) {
    toast.warning('AI 内容为空，未插入编辑区')
    return
  }

  toast.success('内容已插入编辑区')
}
</script>

<template>
  <div class="html-mode-ai-chat-pane min-h-0 flex h-full w-full">
    <Toaster rich-colors position="top-center" />
    <AISwitchBox />
    <AIChatPanel
      ref="aiChatPanelRef"
      :show="true"
      :embedded="true"
      @submit="handleSubmit"
      @cancel="handleCancel"
      @insert-content="handleInsertContent"
    />
  </div>
</template>
