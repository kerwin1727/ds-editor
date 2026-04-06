<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { safeHtmlToMarkdown } from '@/utils/htmlToMarkdown'
import { toast } from '@/composables/useToast'
import { getPlatformWorkflowConfig } from '@/config/platformWorkflowConfig'
import {
  createCrawlTask,
  getArticleById,
  listPendingReviews,
  reviewArticle,
  type PendingReviewItem,
} from '@/services/platformWorkflow'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits([`close`])

const dialogVisible = computed({
  get: () => props.visible,
  set: value => emit(`close`, value),
})

const sourceUrl = ref(``)
const reviewComment = ref(``)
const loading = ref(false)
const crawling = ref(false)
const list = ref<PendingReviewItem[]>([])
const selectedHtml = ref(``)
const selectedTitle = ref(``)
const previewOpen = ref(false)

const workflowConfig = computed(() => getPlatformWorkflowConfig())
const reviewerId = computed(() => workflowConfig.value.reviewerId?.trim() || `admin`)

async function loadPendingList() {
  loading.value = true
  try {
    const result = await listPendingReviews()
    list.value = result.list || []
  }
  catch (error: any) {
    console.error(error)
    toast.error(error?.response?.data?.statusMessage || `加载待审核列表失败`)
  }
  finally {
    loading.value = false
  }
}

async function handleCreateCrawlTask() {
  const targetUrl = sourceUrl.value.trim()
  if (!targetUrl) {
    toast.warning(`请输入抓取链接`)
    return
  }

  crawling.value = true
  try {
    await createCrawlTask(targetUrl, `single_link`)
    toast.success(`抓取任务已创建，内容将进入待审核池`)
    sourceUrl.value = ``
    await loadPendingList()
  }
  catch (error: any) {
    console.error(error)
    toast.error(error?.response?.data?.statusMessage || `创建抓取任务失败`)
  }
  finally {
    crawling.value = false
  }
}

async function handleReview(item: PendingReviewItem, action: 'approve' | 'reject' | 'archive') {
  try {
    await reviewArticle(item.id, action, reviewerId.value, reviewComment.value.trim() || undefined)
    toast.success(`操作成功：${action}`)
    await loadPendingList()
  }
  catch (error: any) {
    console.error(error)
    toast.error(error?.response?.data?.statusMessage || `审核操作失败`)
  }
}

async function handlePreview(item: PendingReviewItem) {
  try {
    const detail = await getArticleById(item.id)
    selectedHtml.value = detail.cleanHtml || ``
    selectedTitle.value = detail.raw?.title || `待审核文章预览`
    previewOpen.value = true
  }
  catch (error: any) {
    console.error(error)
    toast.error(error?.response?.data?.statusMessage || `加载文章详情失败`)
  }
}

async function handleImport(item: PendingReviewItem) {
  try {
    const detail = await getArticleById(item.id)
    const markdown = safeHtmlToMarkdown(detail.cleanHtml || ``)
    if (!markdown.trim()) {
      toast.warning(`文章内容为空，无法导入`)
      return
    }

    document.dispatchEvent(new CustomEvent(`insert-platform-article`, {
      detail: {
        mode: `replace`,
        content: markdown,
        articleId: detail.id,
        title: detail.raw?.title || `导入文章`,
      },
    }))
    toast.success(`文章已导入编辑器`)
  }
  catch (error: any) {
    console.error(error)
    toast.error(error?.response?.data?.statusMessage || `导入文章失败`)
  }
}

watch(() => props.visible, (visible) => {
  if (visible) {
    loadPendingList()
  }
})
</script>

<template>
  <Dialog v-model:open="dialogVisible">
    <DialogContent class="max-w-5xl w-[90vw]">
      <DialogHeader>
        <DialogTitle>主动抓取审核池（管理员）</DialogTitle>
      </DialogHeader>

      <div class="space-y-4 py-2">
        <div class="grid grid-cols-[1fr_auto] gap-2">
          <Input v-model="sourceUrl" placeholder="输入公众号文章链接，创建抓取任务" />
          <Button :disabled="crawling" @click="handleCreateCrawlTask">
            {{ crawling ? "创建中..." : "创建抓取任务" }}
          </Button>
        </div>

        <div class="grid grid-cols-[1fr_auto] gap-2">
          <Input v-model="reviewComment" placeholder="审核意见（可选，最多500字）" />
          <Button variant="outline" :disabled="loading" @click="loadPendingList">
            刷新列表
          </Button>
        </div>

        <div class="max-h-[420px] overflow-auto border rounded-md">
          <table class="w-full text-sm">
            <thead class="bg-muted sticky top-0">
              <tr>
                <th class="px-3 py-2 text-left">
                  标题
                </th>
                <th class="px-3 py-2 text-left">
                  作者
                </th>
                <th class="px-3 py-2 text-left">
                  状态
                </th>
                <th class="px-3 py-2 text-left">
                  创建时间
                </th>
                <th class="px-3 py-2 text-right">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="px-3 py-6 text-center text-muted-foreground">
                  加载中...
                </td>
              </tr>
              <tr v-else-if="list.length === 0">
                <td colspan="5" class="px-3 py-6 text-center text-muted-foreground">
                  暂无待审核文章
                </td>
              </tr>
              <tr v-for="item in list" :key="item.id" class="border-t">
                <td class="px-3 py-2">
                  {{ item.raw?.title || "未命名" }}
                </td>
                <td class="px-3 py-2">
                  {{ item.raw?.author || "-" }}
                </td>
                <td class="px-3 py-2">
                  {{ item.reviewStatus }}
                </td>
                <td class="px-3 py-2">
                  {{ new Date(item.createdAt).toLocaleString() }}
                </td>
                <td class="px-3 py-2">
                  <div class="flex justify-end gap-2">
                    <Button size="sm" variant="outline" @click="handlePreview(item)">
                      预览
                    </Button>
                    <Button size="sm" variant="outline" @click="handleImport(item)">
                      导入编辑器
                    </Button>
                    <Button size="sm" @click="handleReview(item, 'approve')">
                      通过
                    </Button>
                    <Button size="sm" variant="secondary" @click="handleReview(item, 'reject')">
                      驳回
                    </Button>
                    <Button size="sm" variant="destructive" @click="handleReview(item, 'archive')">
                      归档
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="dialogVisible = false">
          关闭
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="previewOpen">
    <DialogContent class="max-w-4xl w-[85vw]">
      <DialogHeader>
        <DialogTitle>{{ selectedTitle }}</DialogTitle>
      </DialogHeader>
      <div class="max-h-[65vh] overflow-auto border rounded-md p-4" v-html="selectedHtml" />
      <DialogFooter>
        <Button variant="outline" @click="previewOpen = false">
          关闭预览
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
