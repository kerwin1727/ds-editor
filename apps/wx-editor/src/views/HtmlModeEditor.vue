<script setup lang="ts">
import appShellRaw from '@/html-mode/tiptap-appmsg-editor/app-shell.html?raw'

defineOptions({ name: `HtmlModeEditor` })

const tiptapRoot = ref<HTMLDivElement | null>(null)
const isBootstrapped = ref(false)
const loadProgress = ref(0)
const displayProgress = computed(() => Math.round(loadProgress.value))
const advancedModeEnabled = ref(false)
const nightModeEnabled = ref(false)

let progressTimer: ReturnType<typeof window.setInterval> | null = null
const ADVANCED_MODE_STORAGE_KEY = `wx-editor:html-advanced-mode`
const NIGHT_MODE_STORAGE_KEY = `wx-editor:html-night-mode`
const ADVANCED_MODE_TOGGLE_EVENT = `wx-editor:advanced-block-tools-toggle`

const appShellBody = appShellRaw
  .replace(/\$\{links\}/g, ``)
  .replace(/\$\{scripts\}/g, ``)
  .replace(/^[\s\S]*<body[^>]*>/i, ``)
  .replace(/<\/body>[\s\S]*$/i, ``)

const stopProgressSimulation = () => {
  if (progressTimer !== null) {
    window.clearInterval(progressTimer)
    progressTimer = null
  }
}

const startProgressSimulation = () => {
  loadProgress.value = 8
  stopProgressSimulation()
  progressTimer = window.setInterval(() => {
    if (loadProgress.value >= 92) {
      return
    }

    const remaining = 92 - loadProgress.value
    const step = Math.max(0.8, remaining * 0.12)
    loadProgress.value = Math.min(92, loadProgress.value + step)
  }, 120)
}

const readAdvancedMode = () => {
  if (typeof window === `undefined`) {
    return false
  }
  return window.localStorage.getItem(ADVANCED_MODE_STORAGE_KEY) === `1`
}

const readNightMode = () => {
  if (typeof window === `undefined`) {
    return false
  }
  return window.localStorage.getItem(NIGHT_MODE_STORAGE_KEY) === `1`
}

const applyAdvancedMode = (enabled: boolean) => {
  if (typeof window === `undefined`) {
    return
  }

  window.localStorage.setItem(ADVANCED_MODE_STORAGE_KEY, enabled ? `1` : `0`)
  ;(window as Window & { __WX_EDITOR_ADVANCED_BLOCK_TOOLS__?: boolean }).__WX_EDITOR_ADVANCED_BLOCK_TOOLS__ = enabled

  if (!isBootstrapped.value) {
    return
  }

  window.dispatchEvent(new CustomEvent(ADVANCED_MODE_TOGGLE_EVENT, {
    detail: { enabled },
  }))
}

const toggleAdvancedMode = () => {
  advancedModeEnabled.value = !advancedModeEnabled.value
  applyAdvancedMode(advancedModeEnabled.value)
}

const applyNightMode = (enabled: boolean) => {
  if (typeof window === `undefined`) {
    return
  }
  window.localStorage.setItem(NIGHT_MODE_STORAGE_KEY, enabled ? `1` : `0`)
}

const toggleNightMode = () => {
  nightModeEnabled.value = !nightModeEnabled.value
  applyNightMode(nightModeEnabled.value)
}

onMounted(async () => {
  advancedModeEnabled.value = readAdvancedMode()
  nightModeEnabled.value = readNightMode()
  applyAdvancedMode(advancedModeEnabled.value)
  applyNightMode(nightModeEnabled.value)
  startProgressSimulation()

  if (tiptapRoot.value) {
    tiptapRoot.value.innerHTML = appShellBody
  }

  if (!isBootstrapped.value) {
    await nextTick()
    await import(`@/html-mode/tiptap-appmsg-editor/main.js`)
    stopProgressSimulation()
    loadProgress.value = 100
    await new Promise((resolve) => {
      window.setTimeout(resolve, 180)
    })
    isBootstrapped.value = true
  }
})

onBeforeUnmount(() => {
  stopProgressSimulation()
})
</script>

<template>
  <div class="html-mode-page" :class="{ 'is-night': nightModeEnabled }">
    <!-- <header class="html-mode-header">
      <RouterLink class="mode-link" to="/md">
        Back to MD mode
      </RouterLink>
    </header> -->

    <main class="html-mode-main">
      <div class="html-mode-controls">
        <button
          type="button"
          class="advanced-toggle-btn icon-toggle-btn"
          :class="{ 'is-enabled': advancedModeEnabled }"
          :aria-pressed="advancedModeEnabled"
          :aria-label="`高阶功能${advancedModeEnabled ? '已开启' : '已关闭'}`"
          :title="`高阶功能${advancedModeEnabled ? '已开启' : '已关闭'}`"
          :data-tooltip="`高阶功能${advancedModeEnabled ? '已开启' : '已关闭'}`"
          @click="toggleAdvancedMode"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 4.5V2M17 22v-2.5M2 7h2.5M19.5 17H22M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M12 7l1.3 2.6 2.9.4-2.1 2 0.5 2.8L12 13.4 9.4 14.8l0.5-2.8-2.1-2 2.9-.4L12 7Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          class="night-toggle-btn icon-toggle-btn"
          :class="{ 'is-enabled': nightModeEnabled }"
          :aria-pressed="nightModeEnabled"
          :aria-label="`夜间模式${nightModeEnabled ? '已开启' : '已关闭'}`"
          :title="`夜间模式${nightModeEnabled ? '已开启' : '已关闭'}`"
          :data-tooltip="`夜间模式${nightModeEnabled ? '已开启' : '已关闭'}`"
          @click="toggleNightMode"
        >
          <svg v-if="nightModeEnabled" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20.6 14.2A8.5 8.5 0 1 1 9.8 3.4a7 7 0 1 0 10.8 10.8Z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8" />
            <path
              d="M12 2.4V5M12 19v2.6M2.4 12H5M19 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
      <div v-if="!isBootstrapped" class="html-mode-loading">
        <div class="loading-card">
          <div class="loading-line w-72" />
          <div class="loading-line w-96" />
          <div class="loading-line w-80" />
          <div class="loading-line w-60" />
          <div class="loading-progress" role="progressbar" :aria-valuenow="displayProgress" aria-valuemin="0" aria-valuemax="100">
            <div class="loading-progress-fill" :style="{ width: `${displayProgress}%` }">
              <span class="loading-rocket" aria-hidden="true">🚀</span>
            </div>
          </div>
        </div>
        <div class="loading-text">
          HTML editor loading... {{ displayProgress }}%
        </div>
      </div>
      <div ref="tiptapRoot" class="tiptap-shell" :class="{ 'is-booting': !isBootstrapped }" />
    </main>
  </div>
</template>

<style scoped lang="less">
.html-mode-page {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: #f5f6f8;
}

.html-mode-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  background: var(--background);
}

.mode-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1;
  text-decoration: none;
  background: rgba(59, 130, 246, 0.12);
  color: #1d4ed8;
}

.html-mode-main {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.html-mode-controls {
  position: absolute;
  right: 18px;
  bottom: 18px;
  display: inline-flex;
  flex-direction: column;
  gap: 8px;
  z-index: 140;
}

.advanced-toggle-btn,
.night-toggle-btn {
  height: 34px;
  width: 34px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid #d0d7e2;
  font-size: 12px;
  color: #4b5563;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(4px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1);
}

.advanced-toggle-btn.is-enabled {
  border-color: rgba(7, 193, 96, 0.4);
  color: #086d3a;
  background: rgba(220, 252, 231, 0.92);
}

.night-toggle-btn.is-enabled {
  border-color: rgba(59, 130, 246, 0.45);
  color: #1e40af;
  background: rgba(219, 234, 254, 0.92);
}

.icon-toggle-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-toggle-btn svg {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.icon-toggle-btn::after {
  content: attr(data-tooltip);
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  z-index: 2;
  padding: 4px 8px;
  border-radius: 6px;
  color: #ffffff;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  background: rgba(15, 23, 42, 0.92);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.24);
  opacity: 0;
  transform: translate(4px, -50%);
  pointer-events: none;
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.icon-toggle-btn:hover::after,
.icon-toggle-btn:focus-visible::after {
  opacity: 1;
  transform: translate(0, -50%);
}

.html-mode-page.is-night {
  background: #0b1220;
}

.html-mode-page.is-night .advanced-toggle-btn,
.html-mode-page.is-night .night-toggle-btn {
  border-color: rgba(71, 85, 105, 0.75);
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.88);
  box-shadow: 0 10px 26px rgba(2, 6, 23, 0.5);
}

.html-mode-page.is-night .advanced-toggle-btn.is-enabled {
  border-color: rgba(34, 197, 94, 0.58);
  color: #86efac;
  background: rgba(6, 78, 59, 0.65);
}

.html-mode-page.is-night .night-toggle-btn.is-enabled {
  border-color: rgba(96, 165, 250, 0.62);
  color: #bfdbfe;
  background: rgba(30, 58, 138, 0.72);
}

.html-mode-page.is-night .icon-toggle-btn::after {
  color: #e2e8f0;
  background: rgba(2, 6, 23, 0.92);
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.44);
}

.html-mode-page.is-night :deep(.html-mode-loading) {
  background: #0b1220;
}

.html-mode-page.is-night :deep(.loading-card) {
  border-color: rgba(51, 65, 85, 0.85);
  background: rgba(15, 23, 42, 0.9);
}

.html-mode-page.is-night :deep(.loading-line) {
  background: linear-gradient(90deg, #1f2937 25%, #334155 50%, #1f2937 75%);
  background-size: 200% 100%;
}

.html-mode-page.is-night :deep(.loading-text) {
  color: #94a3b8;
}

.html-mode-page.is-night :deep(.loading-progress) {
  background: #1e293b;
}

.html-mode-page.is-night :deep(.header) {
  border-bottom: 1px solid rgba(51, 65, 85, 0.95);
  background-color: #0f172a;
}

.html-mode-page.is-night :deep(.header .module-group) {
  background-color: rgba(148, 163, 184, 0.12);
}

.html-mode-page.is-night :deep(.header .module-item) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.header .module-item:hover) {
  background-color: rgba(148, 163, 184, 0.16);
}

.html-mode-page.is-night :deep(.header .dropdown .dropdown-menu) {
  border: 1px solid rgba(71, 85, 105, 0.9);
  background-color: #111827;
  box-shadow: 0 16px 30px rgba(2, 6, 23, 0.5);
}

.html-mode-page.is-night :deep(.header .dropdown .menu-item) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.header .dropdown .menu-item:hover) {
  background-color: rgba(148, 163, 184, 0.14);
}

.html-mode-page.is-night :deep(.toolbar-wrapper) {
  border-bottom: 1px solid rgba(51, 65, 85, 0.95);
  background-color: #111827;
}

.html-mode-page.is-night :deep(#toolbar .btn-group + .btn-group) {
  border-left-color: #334155;
}

.html-mode-page.is-night :deep(#toolbar .edit-btn) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(#toolbar .edit-btn:hover) {
  background-color: rgba(148, 163, 184, 0.16);
}

.html-mode-page.is-night :deep(#toolbar .edit-btn.active) {
  color: #4ade80;
}

.html-mode-page.is-night :deep(#toolbar .block-tools-group .block-action-btn) {
  border-color: rgba(71, 85, 105, 0.92);
  color: #dbeafe;
  background: #0f172a;
}

.html-mode-page.is-night :deep(#toolbar .block-tools-group .block-action-btn:hover) {
  background: rgba(37, 99, 235, 0.15);
}

.html-mode-page.is-night :deep(#toolbar .block-tools-group .block-action-btn:disabled) {
  color: #64748b;
  background: rgba(15, 23, 42, 0.75);
}

.html-mode-page.is-night :deep(#toolbar .dropdown .dropdown-menu) {
  border: 1px solid rgba(71, 85, 105, 0.9);
  background-color: #111827;
  box-shadow: 0 16px 30px rgba(2, 6, 23, 0.5);
}

.html-mode-page.is-night :deep(#toolbar .dropdown .menu-item) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(#toolbar .dropdown .menu-item:hover) {
  background-color: rgba(148, 163, 184, 0.14);
}

.html-mode-page.is-night :deep(.sidebar) {
  border-right: 1px solid rgba(51, 65, 85, 0.95);
  background-color: #0f172a;
}

.html-mode-page.is-night :deep(.sidebar .tabs-nav) {
  border-bottom-color: #334155;
}

.html-mode-page.is-night :deep(.sidebar .tabs-nav .tab-item) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.sidebar .tabs-content) {
  color: rgba(226, 232, 240, 0.92);
}

.html-mode-page.is-night :deep(.sidebar .resource-toolbar) {
  border-bottom-color: #334155;
  background: #0f172a;
}

.html-mode-page.is-night :deep(.sidebar .scope-btn),
.html-mode-page.is-night :deep(.sidebar .resource-login-btn),
.html-mode-page.is-night :deep(.sidebar .resource-logout-btn),
.html-mode-page.is-night :deep(.sidebar .resource-search-input),
.html-mode-page.is-night :deep(.sidebar .resource-type-select),
.html-mode-page.is-night :deep(.sidebar .resource-refresh-btn),
.html-mode-page.is-night :deep(.sidebar .resource-action-btn) {
  border-color: #334155;
  color: #cbd5e1;
  background: #111827;
}

.html-mode-page.is-night :deep(.sidebar .resource-card) {
  border-color: rgba(51, 65, 85, 0.9);
  background: #0f172a;
}

.html-mode-page.is-night :deep(.sidebar .resource-card-title) {
  color: #e2e8f0;
}

.html-mode-page.is-night :deep(.sidebar .resource-card-summary) {
  color: #94a3b8;
}

.html-mode-page.is-night :deep(.sidebar .resource-card-meta) {
  color: #64748b;
}

.html-mode-page.is-night :deep(.sidebar .resource-empty) {
  border-color: #334155;
  color: #94a3b8;
  background: #0f172a;
}

.html-mode-page.is-night :deep(.sidebar),
.html-mode-page.is-night :deep(.sidebar .tabs-content),
.html-mode-page.is-night :deep(.sidebar .resource-list),
.html-mode-page.is-night :deep(.editor-wrapper),
.html-mode-page.is-night :deep(.wx-image-edit-panel),
.html-mode-page.is-night :deep(.wx-image-edit-stage) {
  scrollbar-width: thin;
  scrollbar-color: rgba(100, 116, 139, 0.82) rgba(15, 23, 42, 0.62);
}

.html-mode-page.is-night :deep(.sidebar::-webkit-scrollbar),
.html-mode-page.is-night :deep(.sidebar .tabs-content::-webkit-scrollbar),
.html-mode-page.is-night :deep(.sidebar .resource-list::-webkit-scrollbar),
.html-mode-page.is-night :deep(.editor-wrapper::-webkit-scrollbar),
.html-mode-page.is-night :deep(.wx-image-edit-panel::-webkit-scrollbar),
.html-mode-page.is-night :deep(.wx-image-edit-stage::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

.html-mode-page.is-night :deep(.sidebar::-webkit-scrollbar-track),
.html-mode-page.is-night :deep(.sidebar .tabs-content::-webkit-scrollbar-track),
.html-mode-page.is-night :deep(.sidebar .resource-list::-webkit-scrollbar-track),
.html-mode-page.is-night :deep(.editor-wrapper::-webkit-scrollbar-track),
.html-mode-page.is-night :deep(.wx-image-edit-panel::-webkit-scrollbar-track),
.html-mode-page.is-night :deep(.wx-image-edit-stage::-webkit-scrollbar-track) {
  background: rgba(15, 23, 42, 0.62);
}

.html-mode-page.is-night :deep(.sidebar::-webkit-scrollbar-thumb),
.html-mode-page.is-night :deep(.sidebar .tabs-content::-webkit-scrollbar-thumb),
.html-mode-page.is-night :deep(.sidebar .resource-list::-webkit-scrollbar-thumb),
.html-mode-page.is-night :deep(.editor-wrapper::-webkit-scrollbar-thumb),
.html-mode-page.is-night :deep(.wx-image-edit-panel::-webkit-scrollbar-thumb),
.html-mode-page.is-night :deep(.wx-image-edit-stage::-webkit-scrollbar-thumb) {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.82);
  background-clip: padding-box;
}

.html-mode-page.is-night :deep(.sidebar::-webkit-scrollbar-thumb:hover),
.html-mode-page.is-night :deep(.sidebar .tabs-content::-webkit-scrollbar-thumb:hover),
.html-mode-page.is-night :deep(.sidebar .resource-list::-webkit-scrollbar-thumb:hover),
.html-mode-page.is-night :deep(.editor-wrapper::-webkit-scrollbar-thumb:hover),
.html-mode-page.is-night :deep(.wx-image-edit-panel::-webkit-scrollbar-thumb:hover),
.html-mode-page.is-night :deep(.wx-image-edit-stage::-webkit-scrollbar-thumb:hover) {
  background: rgba(148, 163, 184, 0.9);
  background-clip: padding-box;
}

.html-mode-page.is-night :deep(.wx-resource-modal-panel) {
  border-color: #334155;
  background: #0f172a;
}

.html-mode-page.is-night :deep(.wx-resource-modal-header) {
  border-bottom-color: #334155;
}

.html-mode-page.is-night :deep(.wx-resource-modal-title),
.html-mode-page.is-night :deep(.wx-resource-form-item > span),
.html-mode-page.is-night :deep(.wx-resource-support-copy),
.html-mode-page.is-night :deep(.wx-resource-qr-grid figcaption) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.wx-resource-form-item input),
.html-mode-page.is-night :deep(.wx-resource-form-item select),
.html-mode-page.is-night :deep(.wx-resource-upload-preview),
.html-mode-page.is-night :deep(.wx-resource-btn),
.html-mode-page.is-night :deep(.wx-resource-close-btn) {
  border-color: #334155;
  color: #e2e8f0;
  background: #111827;
}

.html-mode-page.is-night :deep(.wx-block-context-menu) {
  border-color: rgba(71, 85, 105, 0.88);
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 18px 36px rgba(2, 6, 23, 0.56);
}

.html-mode-page.is-night :deep(.wx-block-context-menu-item) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.wx-block-context-menu-item:hover) {
  color: #e2e8f0;
  background: rgba(59, 130, 246, 0.2);
}

.html-mode-page.is-night :deep(.sidebar .graphic-list .graphic-item),
.html-mode-page.is-night :deep(.sidebar .template-list .template-item) {
  background: rgba(30, 41, 59, 0.6);
}

.html-mode-page.is-night :deep(.sidebar .graphic-list .graphic-item:hover),
.html-mode-page.is-night :deep(.sidebar .template-list .template-item:hover) {
  box-shadow: inset 0 0 10px 0 rgba(96, 165, 250, 0.35);
}

.html-mode-page.is-night :deep(.editor-wrapper) {
  background: #0b1220;
}

.html-mode-page.is-night :deep(.editor) {
  background-color: #111827;
  box-shadow: 0 12px 30px rgba(2, 6, 23, 0.45);
}

.html-mode-page.is-night :deep(.footer) {
  border-top: 1px solid rgba(51, 65, 85, 0.75);
  background-color: #111827;
  box-shadow: 0 -2px 16px rgba(2, 6, 23, 0.46);
}

.html-mode-page.is-night :deep(.footer .info) {
  color: #94a3b8;
}

.html-mode-page.is-night :deep(.footer .operation .btn) {
  border-color: #334155;
  color: #cbd5e1;
  background: #0f172a;
}

.html-mode-page.is-night :deep(.footer .operation .btn:hover) {
  background: rgba(30, 41, 59, 0.95);
}

.html-mode-page.is-night :deep(.modal .modal-dialog) {
  border: 1px solid rgba(71, 85, 105, 0.88);
  background: #111827;
}

.html-mode-page.is-night :deep(.modal .modal-header),
.html-mode-page.is-night :deep(.modal .modal-footer) {
  border-color: #334155;
  background: #0f172a;
}

.html-mode-page.is-night :deep(.modal .modal-title),
.html-mode-page.is-night :deep(.modal .tab-item),
.html-mode-page.is-night :deep(.modal .form-item label),
.html-mode-page.is-night :deep(.modal .tip) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.modal input[type='text']) {
  border-color: #334155;
  color: #e2e8f0;
  background: #0b1220;
}

.html-mode-page.is-night :deep(.tiptap.ProseMirror) {
  color: rgba(226, 232, 240, 0.94);
}

.html-mode-page.is-night :deep(.ProseMirror a) {
  color: #93c5fd;
}

.html-mode-page.is-night :deep(.ProseMirror .code-snippet) {
  color: #cbd5e1;
  background-color: #0f172a;
  border-color: #334155;
}

.html-mode-page.is-night :deep(.wx-image-action-toolbar) {
  border-color: rgba(71, 85, 105, 0.9);
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
}

.html-mode-page.is-night :deep(.wx-image-action-btn) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.wx-image-action-btn:hover) {
  color: #e2e8f0;
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.32);
}

.html-mode-page.is-night :deep(.wx-image-action-separator) {
  background: rgba(100, 116, 139, 0.55);
}

:deep(.html-mode-loading) {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: #f5f6f8;
}

:deep(.loading-card) {
  width: min(720px, calc(100% - 48px));
  padding: 20px;
  border-radius: 10px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: #ffffff;
}

:deep(.loading-line) {
  height: 12px;
  margin-top: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
  background-size: 200% 100%;
  animation: html-mode-shimmer 1.2s linear infinite;
}

:deep(.loading-line:first-child) {
  margin-top: 0;
}

:deep(.loading-line.w-96) {
  width: min(100%, 24rem);
}

:deep(.loading-line.w-80) {
  width: min(100%, 20rem);
}

:deep(.loading-line.w-72) {
  width: min(100%, 18rem);
}

:deep(.loading-line.w-60) {
  width: min(100%, 15rem);
}

:deep(.loading-text) {
  font-size: 13px;
  color: #64748b;
  letter-spacing: 0.2px;
}

:deep(.loading-progress) {
  width: 100%;
  height: 8px;
  margin-top: 14px;
  border-radius: 999px;
  overflow: hidden;
  background: #e2e8f0;
}

:deep(.loading-progress-fill) {
  position: relative;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #38bdf8, #3b82f6, #2563eb, #1d4ed8);
  background-size: 220% 100%;
  box-shadow: 0 0 10px rgba(37, 99, 235, 0.4);
  transition: width 0.14s ease-out;
  animation: html-mode-progress-flow 1.4s linear infinite;
}

:deep(.loading-rocket) {
  position: absolute;
  right: 2px;
  top: 50%;
  display: inline-block;
  font-size: 15px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.28)) drop-shadow(0 0 5px rgba(59, 130, 246, 0.35));
  animation: html-mode-rocket-float 0.78s ease-in-out infinite alternate, html-mode-rocket-boost 1.3s ease-in-out infinite;
}

:deep(.loading-rocket)::after {
  content: '';
  position: absolute;
  right: 90%;
  top: 50%;
  width: 12px;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(253, 186, 116, 0.95), rgba(248, 113, 113, 0.7), rgba(248, 113, 113, 0));
  transform: translateY(-50%);
  transform-origin: right center;
  animation: html-mode-trail-flicker 0.34s ease-in-out infinite alternate;
}

:deep(.tiptap-shell) {
  position: relative;
  min-height: 100%;
  height: 100%;
}

:deep(.tiptap-shell.is-booting) {
  visibility: hidden;
}

@keyframes html-mode-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}

@keyframes html-mode-rocket-float {
  from {
    transform: translateY(-50%) rotate(6deg);
  }
  to {
    transform: translateY(calc(-50% - 2px)) rotate(11deg);
  }
}

@keyframes html-mode-rocket-boost {
  from {
    scale: 1;
  }
  to {
    scale: 1.06;
  }
}

@keyframes html-mode-trail-flicker {
  from {
    opacity: 0.65;
    width: 8px;
  }
  to {
    opacity: 1;
    width: 14px;
  }
}

@keyframes html-mode-progress-flow {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 220% 0;
  }
}
</style>
