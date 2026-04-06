<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from '@/composables/useToast'
import { getPlatformWorkflowConfig } from '@/config/platformWorkflowConfig'
import {
  getChannelCapabilities,
  publishWechat,
  validatePublish,
} from '@/services/platformWorkflow'

const props = defineProps<{
  visible: boolean
  contentHtml: string
  defaultTitle?: string
}>()

const emit = defineEmits([`close`])

const dialogVisible = computed({
  get: () => props.visible,
  set: value => emit(`close`, value),
})

const form = ref({
  docId: ``,
  title: ``,
  summary: ``,
  author: ``,
  coverUrl: ``,
})

const validating = ref(false)
const publishing = ref(false)
const capabilities = ref<Array<{ channelType: string, enabled: boolean, note?: string }>>([])

const workflowConfig = computed(() => getPlatformWorkflowConfig())
const operatorId = computed(() => workflowConfig.value.reviewerId?.trim() || `admin`)

function syncInitialData() {
  form.value.title = props.defaultTitle || form.value.title || ``
  const currentId = (window as any).currentPlatformArticleId
  form.value.docId = typeof currentId === `string` ? currentId : ``
}

async function loadCapabilities() {
  try {
    const result = await getChannelCapabilities()
    capabilities.value = result.list || []
  }
  catch (error) {
    console.error(error)
  }
}

async function runValidate() {
  if (!form.value.docId.trim()) {
    toast.error(`请先在审核池导入文章，或手动填写 docId`)
    return false
  }
  if (!form.value.title.trim()) {
    toast.error(`标题不能为空`)
    return false
  }
  if (!props.contentHtml.trim()) {
    toast.error(`当前编辑内容为空`)
    return false
  }

  validating.value = true
  try {
    const result = await validatePublish({
      docId: form.value.docId.trim(),
      title: form.value.title.trim(),
      summary: form.value.summary.trim() || undefined,
      author: form.value.author.trim() || undefined,
      coverUrl: form.value.coverUrl.trim() || undefined,
      contentHtml: props.contentHtml,
      channelType: `wechat`,
    })
    if (!result.ok) {
      const first = result.issues?.[0]
      toast.error(first?.message || `发布校验失败`)
      return false
    }
    toast.success(`发布校验通过`)
    return true
  }
  catch (error: any) {
    console.error(error)
    toast.error(error?.response?.data?.statusMessage || `发布校验失败`)
    return false
  }
  finally {
    validating.value = false
  }
}

async function handlePublish(actionType: 'save_draft' | 'publish') {
  const passed = await runValidate()
  if (!passed) {
    return
  }

  publishing.value = true
  try {
    const result = await publishWechat({
      docId: form.value.docId.trim(),
      title: form.value.title.trim(),
      summary: form.value.summary.trim() || undefined,
      author: form.value.author.trim() || undefined,
      coverUrl: form.value.coverUrl.trim() || undefined,
      contentHtml: props.contentHtml,
      channelType: `wechat`,
      actionType,
      operatorId: operatorId.value,
    })

    const actionText = actionType === `publish` ? `发布` : `草稿`
    toast.success(`${actionText}成功，recordId: ${result.recordId}`)
  }
  catch (error: any) {
    console.error(error)
    toast.error(error?.response?.data?.statusMessage || `发布失败`)
  }
  finally {
    publishing.value = false
  }
}

watch(() => props.visible, (visible) => {
  if (visible) {
    syncInitialData()
    loadCapabilities()
  }
})
</script>

<template>
  <Dialog v-model:open="dialogVisible">
    <DialogContent class="max-w-3xl w-[85vw]">
      <DialogHeader>
        <DialogTitle>平台发布（微信公众号）</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div class="space-y-2">
          <Label for="doc-id">审核文档ID（docId）</Label>
          <Input id="doc-id" v-model="form.docId" placeholder="从审核池导入后会自动填充，也可手动输入" />
          <p class="text-muted-foreground text-xs">
            一期规则：仅管理员审核通过（approved）的文章允许发布/存草稿
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-2">
            <Label for="title">标题</Label>
            <Input id="title" v-model="form.title" placeholder="文章标题" />
          </div>
          <div class="space-y-2">
            <Label for="author">作者</Label>
            <Input id="author" v-model="form.author" placeholder="作者（可选）" />
          </div>
        </div>

        <div class="space-y-2">
          <Label for="summary">摘要</Label>
          <Textarea id="summary" v-model="form.summary" rows="3" placeholder="摘要（可选）" />
        </div>

        <div class="space-y-2">
          <Label for="cover-url">封面 URL</Label>
          <Input id="cover-url" v-model="form.coverUrl" placeholder="https://example.com/cover.jpg（可选）" />
        </div>

        <div class="rounded-md border p-3 text-sm">
          <div class="font-medium mb-2">
            渠道能力
          </div>
          <div class="space-y-1 text-muted-foreground">
            <div v-for="item in capabilities" :key="item.channelType">
              {{ item.channelType }}：{{ item.enabled ? "可用" : "预留" }} {{ item.note ? `（${item.note}）` : "" }}
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="gap-2">
        <Button variant="outline" :disabled="validating" @click="runValidate">
          {{ validating ? "校验中..." : "先校验" }}
        </Button>
        <Button variant="secondary" :disabled="publishing" @click="handlePublish('save_draft')">
          {{ publishing ? "处理中..." : "保存草稿" }}
        </Button>
        <Button :disabled="publishing" @click="handlePublish('publish')">
          {{ publishing ? "处理中..." : "发布文章" }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
