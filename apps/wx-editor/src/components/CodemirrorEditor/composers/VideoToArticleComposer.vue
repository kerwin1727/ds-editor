<script setup lang="ts">
import { Upload } from 'lucide-vue-next'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ComposerApplyPayload {
  prompt: string
  autoSend: boolean
}

const emit = defineEmits<{
  apply: [payload: ComposerApplyPayload]
}>()

const videoUrl = ref('')
const videoTitle = ref('')
const videoTranscript = ref('')
const videoAudience = ref('公众号读者')
const videoTone = ref('专业但通俗')
const videoExtraRequirements = ref('')
const subtitleFileInputRef = ref<HTMLInputElement | null>(null)

function resetComposer() {
  videoUrl.value = ''
  videoTitle.value = ''
  videoTranscript.value = ''
  videoAudience.value = '公众号读者'
  videoTone.value = '专业但通俗'
  videoExtraRequirements.value = ''
}

function extractTranscriptFromJson(input: any): string {
  if (!input) {
    return ''
  }

  if (typeof input === 'string') {
    return input.trim()
  }

  if (Array.isArray(input)) {
    const texts = input
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          return String(item.text || item.content || item.transcript || '').trim()
        }
        return ''
      })
      .filter(Boolean)
    return texts.join('\n')
  }

  if (typeof input === 'object') {
    const directText = String(
      input.text
      || input.content
      || input.transcript
      || input.caption
      || '',
    ).trim()
    if (directText) {
      return directText
    }

    const candidateKeys = ['segments', 'results', 'body', 'captions', 'items', 'data']
    for (const key of candidateKeys) {
      if (input[key]) {
        const nested = extractTranscriptFromJson(input[key])
        if (nested) {
          return nested
        }
      }
    }
  }

  return ''
}

function normalizeSubtitleText(rawText: string) {
  if (!rawText.trim()) {
    return ''
  }

  const withoutBom = rawText.replace(/\uFEFF/g, '').replace(/\r\n/g, '\n')
  const lines = withoutBom.split('\n')
  const cleaned: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }
    if (/^WEBVTT$/i.test(trimmed)) {
      continue
    }
    if (/^(?:Kind|Language):/i.test(trimmed)) {
      continue
    }
    if (/^\d+$/.test(trimmed)) {
      continue
    }
    if (/^NOTE\b/i.test(trimmed)) {
      continue
    }
    if (/^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}/.test(trimmed)) {
      continue
    }

    const plainText = trimmed
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{\\an\d+\}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!plainText) {
      continue
    }
    if (cleaned[cleaned.length - 1] === plainText) {
      continue
    }

    cleaned.push(plainText)
  }

  return cleaned.join('\n')
}

function triggerSubtitleImport() {
  subtitleFileInputRef.value?.click()
}

async function handleSubtitleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) {
    return
  }

  try {
    const text = await file.text()

    let transcript = ''
    try {
      const json = JSON.parse(text)
      transcript = extractTranscriptFromJson(json)
    }
    catch {
      transcript = ''
    }

    const normalizedTranscript = normalizeSubtitleText(transcript || text)
    if (!normalizedTranscript) {
      toast.error('字幕文件解析失败，请检查文件内容')
      return
    }

    if (videoTranscript.value.trim()) {
      videoTranscript.value = `${videoTranscript.value.trim()}\n\n${normalizedTranscript}`
    }
    else {
      videoTranscript.value = normalizedTranscript
    }

    toast.success(`已导入字幕：${file.name}`)
  }
  catch (error) {
    console.error('读取字幕文件失败:', error)
    toast.error('读取字幕文件失败')
  }
  finally {
    input.value = ''
  }
}

function buildVideoToArticlePrompt() {
  const lines: string[] = [
    '你是一名资深中文公众号编辑，请基于下方视频信息，写一篇可直接发布到微信公众号的原创文章。',
    '',
    '输出要求：',
    '1. 只输出 Markdown 正文，不要解释写作过程。',
    '2. 包含：标题、导语、正文（含小标题）、结尾总结、行动建议。',
    '3. 可读性强，段落短，避免空话，适合手机阅读。',
    `4. 目标受众：${videoAudience.value || '公众号读者'}`,
    `5. 写作语气：${videoTone.value || '专业但通俗'}`,
  ]

  if (videoExtraRequirements.value.trim()) {
    lines.push(`6. 额外要求：${videoExtraRequirements.value.trim()}`)
  }

  lines.push(
    '',
    '视频素材信息：',
    `- 视频链接：${videoUrl.value.trim() || '未提供'}`,
    `- 视频主题：${videoTitle.value.trim() || '未提供'}`,
    '',
    '视频字幕/口播稿/要点：',
    videoTranscript.value.trim() || '未提供',
    '',
    '请开始写作。',
  )

  return lines.join('\n')
}

function applyPrompt(autoSend = false) {
  const hasTranscript = videoTranscript.value.trim().length > 0
  const hasUrl = videoUrl.value.trim().length > 0

  if (!hasTranscript && !hasUrl) {
    toast.error('请至少提供视频链接或字幕要点')
    return
  }

  if (!hasTranscript) {
    toast.warning('仅提供视频链接时，模型可能无法直接读取视频内容，建议补充字幕或要点')
  }

  emit('apply', {
    prompt: buildVideoToArticlePrompt(),
    autoSend,
  })

  toast.success(autoSend ? '已发送视频转文请求，正在生成文章' : '已生成视频转文提示词，可直接发送')
}

function applyAndSend() {
  applyPrompt(true)
}
</script>

<template>
  <div class="bg-muted border-b p-3">
    <div class="mb-2 text-sm font-medium">
      视频分析转公众号文章
    </div>
    <p class="text-muted-foreground mb-2 text-xs">
      可导入字幕文件（srt/vtt/txt/json）或手动粘贴字幕，再生成公众号文章。
    </p>
    <input
      ref="subtitleFileInputRef"
      type="file"
      accept=".srt,.vtt,.txt,.json"
      class="hidden"
      @change="handleSubtitleFileChange"
    >
    <div class="grid gap-2 md:grid-cols-2">
      <input
        v-model="videoUrl"
        type="text"
        placeholder="视频链接（可选）"
        class="bg-background border-input h-9 w-full border rounded-md px-3 text-sm"
      >
      <input
        v-model="videoTitle"
        type="text"
        placeholder="视频主题（可选）"
        class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
      >
    </div>
    <Textarea
      v-model="videoTranscript"
      class="bg-background mt-2 w-full text-sm"
      :rows="5"
      placeholder="粘贴视频字幕、口播稿或要点（建议提供）"
    />
    <div class="mt-2 flex justify-end">
      <Button variant="outline" size="sm" @click="triggerSubtitleImport">
        <Upload class="mr-1 h-3.5 w-3.5" />
        导入字幕文件
      </Button>
    </div>
    <div class="grid mt-2 gap-2 md:grid-cols-2">
      <input
        v-model="videoAudience"
        type="text"
        placeholder="目标受众，例如：职场新人"
        class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
      >
      <input
        v-model="videoTone"
        type="text"
        placeholder="写作语气，例如：专业但通俗"
        class="border-input bg-background h-9 w-full border rounded-md px-3 text-sm"
      >
    </div>
    <Textarea
      v-model="videoExtraRequirements"
      class="bg-background mt-2 w-full text-sm"
      :rows="2"
      placeholder="额外要求（可选），如：控制在1200字内，增加案例"
    />
    <div class="mt-2 flex justify-end gap-2">
      <Button variant="outline" size="sm" @click="resetComposer">
        清空
      </Button>
      <Button size="sm" @click="applyPrompt()">
        生成提示词
      </Button>
      <Button size="sm" @click="applyAndSend">
        一键生成文章
      </Button>
    </div>
  </div>
</template>
