<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createTextVideoBlob, downloadVideoBlob, type TextVideoAspectRatio } from '@/services/textVideo'

interface ComposerApplyPayload {
  prompt: string
  autoSend: boolean
}

const props = defineProps<{
  latestAssistantContent?: string
}>()

const emit = defineEmits<{
  apply: [payload: ComposerApplyPayload]
}>()

const articleVideoTitle = ref('')
const articleVideoContent = ref('')
const articleVideoAudience = ref('公众号读者')
const articleVideoStyle = ref('知识讲解')
const articleVideoAspectRatio = ref<TextVideoAspectRatio>('9:16')
const articleVideoSceneDuration = ref(4)
const articleVideoRenderProgress = ref(0)
const articleVideoRendering = ref(false)
const articleVideoAudioFile = ref<File | null>(null)
const articleVideoAudioFileName = ref('')
const articleAudioFileInputRef = ref<HTMLInputElement | null>(null)

function clearArticleAudioFile() {
  articleVideoAudioFile.value = null
  articleVideoAudioFileName.value = ''
  if (articleAudioFileInputRef.value) {
    articleAudioFileInputRef.value.value = ''
  }
}

function resetComposer() {
  articleVideoTitle.value = ''
  articleVideoContent.value = ''
  articleVideoAudience.value = '公众号读者'
  articleVideoStyle.value = '知识讲解'
  articleVideoAspectRatio.value = '9:16'
  articleVideoSceneDuration.value = 4
  articleVideoRenderProgress.value = 0
  clearArticleAudioFile()
}

function loadLatestAIArticleToVideo() {
  const latestContent = props.latestAssistantContent?.trim() || ''
  if (!latestContent) {
    toast.error('当前会话没有可用的 AI 正文内容')
    return false
  }

  articleVideoContent.value = latestContent
  if (!articleVideoTitle.value.trim()) {
    const firstLine = latestContent.split('\n').find(line => line.trim()) || '文转视频草稿'
    articleVideoTitle.value = firstLine.replace(/^#+\s*/, '').slice(0, 36)
  }
  toast.success('已填充最近一次 AI 回复内容')
  return true
}

function triggerArticleAudioImport() {
  articleAudioFileInputRef.value?.click()
}

function handleArticleAudioFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  const looksLikeAudio = file.type.startsWith('audio/')
    || /\.(?:mp3|wav|m4a|aac|ogg|webm)$/i.test(file.name)

  if (!looksLikeAudio) {
    toast.error('请选择音频文件（mp3/wav/m4a/aac/ogg/webm）')
    input.value = ''
    return
  }

  articleVideoAudioFile.value = file
  articleVideoAudioFileName.value = file.name
  toast.success(`已导入配音音频：${file.name}`)
  input.value = ''
}

function buildArticleToVideoPrompt() {
  const article = articleVideoContent.value.trim()
  const sceneDuration = Math.min(15, Math.max(2, Number(articleVideoSceneDuration.value) || 4))
  const lines: string[] = [
    '你是一名短视频导演与编剧，请把下面文章改编成适合短视频制作的执行稿。',
    '',
    '输出要求：',
    '1. 仅输出 Markdown，禁止额外解释。',
    '2. 先输出【视频定位】（1-2 句）。',
    '3. 再输出【分镜脚本表格】，列为：镜头序号｜时长｜画面描述｜字幕文案｜口播文案。',
    '4. 再输出【完整配音稿】（适配口播）。',
    '5. 再输出【封面标题】与【发布文案（30字内）】。',
    `6. 目标受众：${articleVideoAudience.value || '公众号读者'}`,
    `7. 视频风格：${articleVideoStyle.value || '知识讲解'}`,
    `8. 建议画幅：${articleVideoAspectRatio.value}`,
    `9. 单镜头建议时长：约 ${sceneDuration} 秒`,
    '',
    '原始文章：',
    article || '未提供',
  ]

  return lines.join('\n')
}

function applyPrompt(autoSend = false) {
  if (!articleVideoContent.value.trim()) {
    const hasLoaded = loadLatestAIArticleToVideo()
    if (!hasLoaded) {
      toast.error('请先输入文章正文，或填充最近 AI 回复')
      return
    }
  }

  emit('apply', {
    prompt: buildArticleToVideoPrompt(),
    autoSend,
  })

  toast.success(autoSend ? '已发送文转视频分镜请求' : '已生成文转视频分镜提示词')
}

function applyAndSend() {
  applyPrompt(true)
}

async function exportArticleToVideoDraft() {
  if (articleVideoRendering.value) {
    return
  }

  if (!articleVideoContent.value.trim()) {
    const hasLoaded = loadLatestAIArticleToVideo()
    if (!hasLoaded) {
      toast.error('请先输入文章正文，才能导出视频')
      return
    }
  }

  try {
    articleVideoRendering.value = true
    articleVideoRenderProgress.value = 0

    const outputTitle = articleVideoTitle.value.trim() || '文转视频草稿'
    const blob = await createTextVideoBlob({
      title: outputTitle,
      content: articleVideoContent.value,
      aspectRatio: articleVideoAspectRatio.value,
      sceneDurationSeconds: Number(articleVideoSceneDuration.value) || 4,
      audioBlob: articleVideoAudioFile.value || undefined,
      onProgress: (progress) => {
        articleVideoRenderProgress.value = progress
      },
    })

    const ratioTag = articleVideoAspectRatio.value.replace(':', 'x')
    downloadVideoBlob(blob, `${outputTitle}-${ratioTag}-${Date.now()}`)
    articleVideoRenderProgress.value = 1
    toast.success(articleVideoAudioFile.value ? '有声草稿视频已导出（WebM）' : '草稿视频已导出（WebM）')
  }
  catch (error) {
    console.error('导出文转视频失败:', error)
    const message = (error as Error)?.message || '导出失败'
    toast.error(`导出文转视频失败：${message}`)
  }
  finally {
    articleVideoRendering.value = false
  }
}
</script>

<template>
  <div class="bg-muted border-b p-3">
    <div class="mb-2 text-sm font-medium">
      文案转视频草稿
    </div>
    <p class="text-muted-foreground mb-2 text-xs">
      输入或粘贴公众号文章，支持一键生成分镜提示词，并导出草稿视频（WebM）。
    </p>
    <input
      v-model="articleVideoTitle"
      type="text"
      placeholder="视频标题（可选）"
      class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
    >
    <Textarea
      v-model="articleVideoContent"
      class="bg-background mt-2 w-full text-sm"
      :rows="8"
      placeholder="粘贴文章正文（支持 Markdown）"
    />
    <input
      ref="articleAudioFileInputRef"
      type="file"
      accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.webm"
      class="hidden"
      @change="handleArticleAudioFileChange"
    >
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" @click="triggerArticleAudioImport">
          导入配音音频
        </Button>
        <Button
          v-if="articleVideoAudioFile"
          variant="ghost"
          size="sm"
          @click="clearArticleAudioFile"
        >
          移除配音
        </Button>
      </div>
      <span class="text-muted-foreground text-xs">
        {{ articleVideoAudioFileName || '未导入配音，默认导出无声视频' }}
      </span>
    </div>
    <div class="grid mt-2 gap-2 md:grid-cols-3">
      <input
        v-model="articleVideoAudience"
        type="text"
        placeholder="目标受众，例如：职场新人"
        class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
      >
      <input
        v-model="articleVideoStyle"
        type="text"
        placeholder="视频风格，例如：知识讲解"
        class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
      >
      <select
        v-model="articleVideoAspectRatio"
        class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
      >
        <option value="9:16">
          竖屏 9:16
        </option>
        <option value="16:9">
          横屏 16:9
        </option>
        <option value="1:1">
          方屏 1:1
        </option>
      </select>
    </div>
    <div class="grid mt-2 gap-2 md:grid-cols-2">
      <input
        v-model.number="articleVideoSceneDuration"
        type="number"
        min="2"
        max="15"
        placeholder="单镜头秒数（2-15）"
        class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
      >
      <div class="text-muted-foreground border-input bg-background h-9 flex items-center border rounded-md px-3 text-xs">
        导出进度：{{ Math.round(articleVideoRenderProgress * 100) }}%
      </div>
    </div>
    <div class="mt-2 flex flex-wrap justify-end gap-2">
      <Button variant="outline" size="sm" @click="loadLatestAIArticleToVideo">
        填充最近 AI 回复
      </Button>
      <Button variant="outline" size="sm" @click="resetComposer">
        清空
      </Button>
      <Button size="sm" @click="applyPrompt()">
        生成分镜提示词
      </Button>
      <Button size="sm" @click="applyAndSend">
        一键发送分镜
      </Button>
      <Button size="sm" :disabled="articleVideoRendering" @click="exportArticleToVideoDraft">
        {{ articleVideoRendering ? '正在导出视频...' : (articleVideoAudioFile ? '导出有声草稿视频(WebM)' : '导出草稿视频(WebM)') }}
      </Button>
    </div>
  </div>
</template>
