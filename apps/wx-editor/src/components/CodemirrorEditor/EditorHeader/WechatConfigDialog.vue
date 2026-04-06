<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from '@/composables/useToast'
import {
  getPlatformWorkflowConfig,
  resetPlatformWorkflowConfig,
  updatePlatformWorkflowConfig,
} from '@/config/platformWorkflowConfig'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits([`close`])

const dialogVisible = computed({
  get: () => props.visible,
  set: value => emit(`close`, value),
})

// 表单数据
const form = ref({
  appID: ``,
  appsecret: ``,
  proxyOrigin: ``,
  imageProxyUrl: ``,
  platformApiBaseUrl: ``,
  reviewerId: ``,
})

function loadPlatformConfig() {
  const config = getPlatformWorkflowConfig()
  form.value.platformApiBaseUrl = config.platformApiBaseUrl || ``
  form.value.reviewerId = config.reviewerId || ``
}

function loadWechatConfig() {
  const wxProxyConfig = localStorage.getItem(`wxProxyConfig`)
  if (!wxProxyConfig) {
    form.value.appID = ``
    form.value.appsecret = ``
    form.value.proxyOrigin = ``
    form.value.imageProxyUrl = ``
    return
  }

  try {
    const config = JSON.parse(wxProxyConfig)
    form.value.appID = config.appID || ``
    form.value.appsecret = config.appsecret || ``
    form.value.proxyOrigin = config.proxyOrigin || ``
    form.value.imageProxyUrl = config.imageProxyUrl || ``

    // 向后兼容：如果旧版本存在该字段，也读取到新配置面板
    form.value.platformApiBaseUrl = config.platformApiBaseUrl || form.value.platformApiBaseUrl
    form.value.reviewerId = config.reviewerId || form.value.reviewerId
  }
  catch (e) {
    console.error(`解析全局代理配置失败`, e)
  }
}

// 加载配置
onMounted(() => {
  loadPlatformConfig()
  loadWechatConfig()
})

// 监听对话框打开状态，在每次打开时重新加载配置
watch(() => props.visible, (newVal) => {
  if (newVal) {
    loadPlatformConfig()
    loadWechatConfig()
  }
})

// 保存配置
function saveConfig() {
  // 保存所有配置到全局代理配置中
  const wxProxyConfig = {
    appID: form.value.appID,
    appsecret: form.value.appsecret,
    proxyOrigin: form.value.proxyOrigin,
    imageProxyUrl: form.value.imageProxyUrl,
    platformApiBaseUrl: form.value.platformApiBaseUrl,
    reviewerId: form.value.reviewerId,
  }
  localStorage.setItem(`wxProxyConfig`, JSON.stringify(wxProxyConfig))

  // 移除旧的 mpConfig（如果存在）
  localStorage.removeItem(`mpConfig`)

  updatePlatformWorkflowConfig({
    platformApiBaseUrl: form.value.platformApiBaseUrl,
    reviewerId: form.value.reviewerId,
  })

  toast.success(`配置保存成功`)
  dialogVisible.value = false
}

// 清空配置
function resetConfig() {
  // 清空全局代理配置
  localStorage.removeItem(`wxProxyConfig`)
  resetPlatformWorkflowConfig()

  // 清空表单
  form.value = {
    appID: ``,
    appsecret: ``,
    proxyOrigin: ``,
    imageProxyUrl: ``,
    platformApiBaseUrl: ``,
    reviewerId: ``,
  }

  toast.success(`配置已清空`)
}
</script>

<template>
  <Dialog v-model:open="dialogVisible">
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>微信公众号配置</DialogTitle>
      </DialogHeader>

      <div class="space-y-6 py-4">
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="appID">AppID</Label>
            <Input
              id="appID"
              v-model="form.appID"
              placeholder="请输入微信公众号 AppID"
            />
            <p class="text-muted-foreground text-sm">
              在微信公众平台后台的"开发"->"基本配置"中获取
            </p>
          </div>

          <div class="space-y-2">
            <Label for="appsecret">AppSecret</Label>
            <Input
              id="appsecret"
              v-model="form.appsecret"
              type="password"
              placeholder="请输入微信公众号 AppSecret"
            />
            <p class="text-muted-foreground text-sm">
              在微信公众平台后台的"开发"->"基本配置"中获取
            </p>
          </div>
        </div>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="proxyOrigin">代理域名</Label>
            <Input
              id="proxyOrigin"
              v-model="form.proxyOrigin"
              placeholder="http://xxx.com"
            />
            <p class="text-muted-foreground text-sm">
              代理域名对应的 ip 地址应在微信公众平台的 ip 白名单中
            </p>
          </div>
        </div>

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="imageProxyUrl">图片代理 URL</Label>
            <Input
              id="imageProxyUrl"
              v-model="form.imageProxyUrl"
              placeholder="https://xxx.com?url={url}"
            />
            <p class="text-muted-foreground text-sm">
              配置后图片将通过该代理 URL 进行加载，使用 {url} 作为原始图片 URL 的占位符。不配置则不使用代理。
            </p>
          </div>
        </div>

        <div class="h-px bg-border" />

        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="platformApiBaseUrl">平台后端地址</Label>
            <Input
              id="platformApiBaseUrl"
              v-model="form.platformApiBaseUrl"
              placeholder="http://127.0.0.1:3000"
            />
            <p class="text-muted-foreground text-sm">
              用于抓取审核池/发布链路接口调用，不填默认当前站点同源。
            </p>
          </div>

          <div class="space-y-2">
            <Label for="reviewerId">管理员ID</Label>
            <Input
              id="reviewerId"
              v-model="form.reviewerId"
              placeholder="admin"
            />
            <p class="text-muted-foreground text-sm">
              用于审核动作和发布操作人标识。
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="resetConfig">
          清空配置
        </Button>
        <Button @click="saveConfig">
          保存配置
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
