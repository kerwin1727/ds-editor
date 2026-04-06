<script setup lang="ts">
import wxPayQrCode from '@/assets/images/wxpay.jfif'
import wxFriendQrCode from '@/assets/images/wechat.jfif'

type DialogMode = 'login' | 'support'

interface ResourceAuthUser {
  id: number
  username: string
  role: string
  createdAt?: string
}

interface ResourceAuthResult {
  token: string
  user: ResourceAuthUser
}

const RESOURCE_API_BASE_STORAGE_KEY = `wx-editor:resource-api-base`
const DEFAULT_RESOURCE_API_BASE = `/wx-editor-api`

const visible = ref(false)
const mode = ref<DialogMode>('login')
const loading = ref(false)
const username = ref('admin')
const password = ref('kerwin')
const errorMessage = ref('')

let resolver: ((result: ResourceAuthResult | null) => void) | null = null

function getResourceApiBase() {
  const win = window as Window & { __WX_EDITOR_RESOURCE_API_BASE__?: string }
  const fromWindow = String(win.__WX_EDITOR_RESOURCE_API_BASE__ || '').trim()
  const fromStorage = String(
    window.localStorage.getItem(RESOURCE_API_BASE_STORAGE_KEY) || '',
  ).trim()
  const base = fromWindow || fromStorage || DEFAULT_RESOURCE_API_BASE
  return base.endsWith('/') ? base.slice(0, -1) : base
}

function resetState() {
  loading.value = false
  errorMessage.value = ''
  mode.value = 'login'
}

function close(result: ResourceAuthResult | null = null) {
  visible.value = false
  resetState()
  if (resolver) {
    resolver(result)
    resolver = null
  }
}

function open() {
  resetState()
  visible.value = true
  return new Promise<ResourceAuthResult | null>((resolve) => {
    resolver = resolve
  })
}

async function submitLogin() {
  const nextUsername = username.value.trim()
  const nextPassword = password.value

  if (!nextUsername || !nextPassword) {
    errorMessage.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  errorMessage.value = ''

  try {
    const response = await fetch(`${getResourceApiBase()}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: nextUsername,
        password: nextPassword,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(payload?.message || '登录失败，请稍后重试')
    }

    close({
      token: String(payload.token || ''),
      user: payload.user || {
        id: 0,
        username: nextUsername,
        role: 'user',
      },
    })
  }
  catch (error: any) {
    errorMessage.value = error?.message || '登录失败，请稍后重试'
  }
  finally {
    loading.value = false
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!visible.value)
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    close(null)
  }
}

function switchToSupport() {
  mode.value = 'support'
  errorMessage.value = ''
}

function backToLogin() {
  mode.value = 'login'
  errorMessage.value = ''
}

onMounted(() => {
  const win = window as Window & {
    __WX_EDITOR_OPEN_RESOURCE_LOGIN__?: () => Promise<ResourceAuthResult | null>
  }
  win.__WX_EDITOR_OPEN_RESOURCE_LOGIN__ = open
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  const win = window as Window & {
    __WX_EDITOR_OPEN_RESOURCE_LOGIN__?: () => Promise<ResourceAuthResult | null>
  }
  if (win.__WX_EDITOR_OPEN_RESOURCE_LOGIN__ === open) {
    delete win.__WX_EDITOR_OPEN_RESOURCE_LOGIN__
  }
  window.removeEventListener('keydown', handleKeydown)
})

defineExpose({
  open,
  close,
})
</script>

<template>
  <Teleport to="body">
    <Transition name="resource-auth-fade">
      <div v-if="visible" class="resource-auth-shell">
        <div class="resource-auth-mask" @click="close(null)" />
        <div class="resource-auth-dialog">
          <header class="resource-auth-header">
            <div class="resource-auth-title">
              {{ mode === 'login' ? '登录资源库' : '注册说明' }}
            </div>
            <button class="resource-auth-close" type="button" aria-label="关闭" @click="close(null)">
              ×
            </button>
          </header>

          <section v-if="mode === 'login'" class="resource-auth-body">
            <form class="resource-auth-form" @submit.prevent="submitLogin">
              <label class="resource-auth-field">
                <span class="resource-auth-label">用户名</span>
                <input
                  v-model="username"
                  class="resource-auth-input"
                  type="text"
                  autocomplete="username"
                  placeholder="请输入用户名"
                >
              </label>
              <label class="resource-auth-field">
                <span class="resource-auth-label">密码</span>
                <input
                  v-model="password"
                  class="resource-auth-input"
                  type="password"
                  autocomplete="current-password"
                  placeholder="请输入密码"
                >
              </label>

              <div v-if="errorMessage" class="resource-auth-error">
                {{ errorMessage }}
              </div>

              <div class="resource-auth-actions">
                <button type="button" class="resource-auth-link" @click="switchToSupport">
                  没有账号？点此注册
                </button>
                <button type="submit" class="resource-auth-submit" :disabled="loading">
                  {{ loading ? '登录中...' : '登录' }}
                </button>
              </div>
            </form>
          </section>

          <section v-else class="resource-auth-body resource-auth-support">
            <div class="resource-auth-qr-grid">
              <figure class="resource-auth-qr-card">
                <img :src="wxPayQrCode" alt="微信收款码">
                <figcaption>微信收款码</figcaption>
              </figure>
              <figure class="resource-auth-qr-card">
                <img :src="wxFriendQrCode" alt="微信好友码">
                <figcaption>微信好友码</figcaption>
              </figure>
            </div>
            <p class="resource-auth-copy">
              此为高级功能如果用得顺手请支持作者一杯咖啡，ps实际是交服务器费用苦笑😅，当然不用高级功能其实也可以开心的码字，支持完成加我微信好友发截图我会给你账号。
            </p>
            <div class="resource-auth-actions support-actions">
              <button type="button" class="resource-auth-secondary" @click="backToLogin">
                返回登录
              </button>
              <button type="button" class="resource-auth-submit" @click="close(null)">
                我知道了
              </button>
            </div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="less">
.resource-auth-shell {
  position: fixed;
  inset: 0;
  z-index: 480;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resource-auth-mask {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 28% 20%, rgba(59, 130, 246, 0.18), transparent 44%),
    radial-gradient(circle at 75% 84%, rgba(7, 193, 96, 0.16), transparent 42%),
    rgba(2, 6, 23, 0.55);
  backdrop-filter: blur(6px);
}

.resource-auth-dialog {
  position: relative;
  width: min(92vw, 560px);
  max-height: calc(100vh - 40px);
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 18px;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.95));
  box-shadow: 0 30px 70px rgba(15, 23, 42, 0.35);
}

.resource-auth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.92);
}

.resource-auth-title {
  color: #0f172a;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.resource-auth-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid rgba(203, 213, 225, 0.88);
  border-radius: 10px;
  color: #64748b;
  font-size: 20px;
  line-height: 1;
  background: #ffffff;
  cursor: pointer;
}

.resource-auth-close:hover {
  color: #0f172a;
  background: #f8fafc;
}

.resource-auth-body {
  padding: 18px;
}

.resource-auth-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-auth-field {
  display: block;
}

.resource-auth-label {
  display: inline-block;
  margin-bottom: 6px;
  color: #475569;
  font-size: 12px;
}

.resource-auth-input {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border: 1px solid #d4dbe7;
  border-radius: 10px;
  color: #0f172a;
  font-size: 14px;
  background: #ffffff;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.resource-auth-input:focus {
  border-color: rgba(59, 130, 246, 0.56);
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.14);
}

.resource-auth-error {
  padding: 8px 10px;
  border: 1px solid rgba(248, 113, 113, 0.42);
  border-radius: 8px;
  color: #b91c1c;
  font-size: 12px;
  background: rgba(254, 226, 226, 0.7);
}

.resource-auth-actions {
  margin-top: 2px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.resource-auth-link {
  border: none;
  color: #2563eb;
  font-size: 12px;
  background: transparent;
  cursor: pointer;
}

.resource-auth-link:hover {
  color: #1d4ed8;
  text-decoration: underline;
}

.resource-auth-submit,
.resource-auth-secondary {
  height: 36px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
}

.resource-auth-submit {
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb, #3b82f6);
  box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
}

.resource-auth-submit:hover:not(:disabled) {
  background: linear-gradient(135deg, #1d4ed8, #2563eb);
}

.resource-auth-submit:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.resource-auth-secondary {
  border-color: #d4dbe7;
  color: #334155;
  background: #ffffff;
}

.resource-auth-secondary:hover {
  border-color: rgba(59, 130, 246, 0.5);
  color: #1d4ed8;
}

.resource-auth-support {
  padding-top: 16px;
}

.resource-auth-qr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.resource-auth-qr-card {
  margin: 0;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  text-align: center;
  background: #ffffff;
}

.resource-auth-qr-card img {
  display: block;
  width: 100%;
  max-width: 210px;
  margin: 0 auto;
  border-radius: 10px;
}

.resource-auth-qr-card figcaption {
  margin-top: 8px;
  color: #475569;
  font-size: 12px;
}

.resource-auth-copy {
  margin: 14px 2px 0;
  color: #334155;
  font-size: 13px;
  line-height: 1.7;
}

.support-actions {
  justify-content: flex-end;
  margin-top: 14px;
}

.resource-auth-fade-enter-active,
.resource-auth-fade-leave-active {
  transition: opacity 0.18s ease;
}

.resource-auth-fade-enter-from,
.resource-auth-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .resource-auth-dialog {
    border-radius: 14px;
  }

  .resource-auth-header {
    padding: 14px;
  }

  .resource-auth-title {
    font-size: 16px;
  }

  .resource-auth-body {
    padding: 14px;
  }

  .resource-auth-qr-grid {
    grid-template-columns: 1fr;
  }
}
</style>
