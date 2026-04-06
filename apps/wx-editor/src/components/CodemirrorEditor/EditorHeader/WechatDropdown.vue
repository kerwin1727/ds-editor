<script setup lang="ts">
import { CheckSquare, Image, MessageCircle, Send, Settings } from 'lucide-vue-next'
import { ref } from 'vue'
import PlatformPublishDialog from '@/components/CodemirrorEditor/EditorHeader/PlatformPublishDialog.vue'
import PlatformReviewDialog from '@/components/CodemirrorEditor/EditorHeader/PlatformReviewDialog.vue'
import WechatConfigDialog from '@/components/CodemirrorEditor/EditorHeader/WechatConfigDialog.vue'
import WechatMaterialLibraryDialog from '@/components/CodemirrorEditor/WechatMaterialLibraryDialog.vue'
import { getProxyUrl } from '@/composables/useImageProxy'

const wechatConfigDialogVisible = ref(false)
const wechatMaterialLibraryDialogVisible = ref(false)
const platformReviewDialogVisible = ref(false)
const platformPublishDialogVisible = ref(false)
const publishContentHtml = ref(``)
const publishDefaultTitle = ref(``)

// 处理插入素材事件
function handleInsertMaterial(data: { materials: any[] }) {
  // 处理多个素材的插入
  if (data.materials && data.materials.length > 0) {
    // 为每个选中的素材生成内容，目前只处理图片类型
    const contents = data.materials.map((material) => {
      console.log(material.type)
      if (material.type === `image`) {
        // 使用代理服务，避免跨域问题
        const imageUrl = material.url || material.thumb_url
        const proxyUrl = getProxyUrl(imageUrl)
        return `![${material.name || `微信图片`}](${proxyUrl})`
      }
      // 其他类型的素材暂不处理
      return ``
    }).filter(content => content !== ``).join(`\\n`) // 过滤空内容并用换行符连接

    console.log(`插入素材到编辑器:`, data.materials)

    // 发送自定义事件，让父组件处理
    document.dispatchEvent(new CustomEvent(`insert-wechat-material`, {
      detail: { content: contents, materials: data.materials },
    }))
  }
}

function openPlatformPublishDialog() {
  const outputEl = document.querySelector(`#output`) as HTMLElement | null
  publishContentHtml.value = outputEl?.innerHTML || ``

  const titleEl = document.querySelector(`#output h1, #output h2`) as HTMLElement | null
  publishDefaultTitle.value = titleEl?.innerText || ``

  platformPublishDialogVisible.value = true
}
</script>

<template>
  <MenubarMenu>
    <MenubarTrigger>
      <MessageCircle class="mr-2 size-4" />
      微信公众号
    </MenubarTrigger>
    <MenubarContent align="start">
      <MenubarItem @click="wechatConfigDialogVisible = true">
        <Settings class="mr-2 h-4 w-4" />
        <span>配置</span>
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem @click="wechatMaterialLibraryDialogVisible = true">
        <Image class="mr-2 h-4 w-4" />
        <span>素材库</span>
      </MenubarItem>
      <MenubarSeparator />
      <MenubarItem @click="platformReviewDialogVisible = true">
        <CheckSquare class="mr-2 h-4 w-4" />
        <span>审核池（管理员）</span>
      </MenubarItem>
      <MenubarItem @click="openPlatformPublishDialog">
        <Send class="mr-2 h-4 w-4" />
        <span>平台发布</span>
      </MenubarItem>
    </MenubarContent>
  </MenubarMenu>

  <WechatConfigDialog
    :visible="wechatConfigDialogVisible"
    @close="wechatConfigDialogVisible = false"
  />
  <WechatMaterialLibraryDialog
    :visible="wechatMaterialLibraryDialogVisible"
    @close="wechatMaterialLibraryDialogVisible = false"
    @insert-material="handleInsertMaterial"
  />

  <PlatformReviewDialog
    :visible="platformReviewDialogVisible"
    @close="platformReviewDialogVisible = false"
  />

  <PlatformPublishDialog
    :visible="platformPublishDialogVisible"
    :content-html="publishContentHtml"
    :default-title="publishDefaultTitle"
    @close="platformPublishDialogVisible = false"
  />
</template>
