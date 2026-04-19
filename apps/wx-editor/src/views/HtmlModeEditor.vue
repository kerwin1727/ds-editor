<script setup lang="ts">
import CodeMirror from 'codemirror'
import 'codemirror/addon/edit/closetag'
import 'codemirror/addon/edit/matchtags'
import 'codemirror/mode/htmlmixed/htmlmixed'
import 'codemirror/mode/xml/xml'
import appShellRaw from '@/html-mode/tiptap-appmsg-editor/app-shell.html?raw'

defineOptions({ name: `HtmlModeEditor` })

type HtmlEditorBridge = {
  getHTML: () => string
  isDestroyed?: boolean
  commands: {
    setContent: (
      content: string,
      emitUpdate?: boolean,
      parseOptions?: Record<string, unknown>,
    ) => boolean
  }
  on: (event: `update`, callback: () => void) => void
  off: (event: `update`, callback: () => void) => void
}

const tiptapRoot = ref<HTMLDivElement | null>(null)
const sourceEditorTextarea = ref<HTMLTextAreaElement | null>(null)
const isBootstrapped = ref(false)
const loadProgress = ref(0)
const displayProgress = computed(() => Math.round(loadProgress.value))
const advancedModeEnabled = ref(false)
const nightModeEnabled = ref(false)
const sourceViewEnabled = ref(false)
const sourceCode = ref(``)
const sourceSyncState = ref<`idle` | `syncing` | `error`>(`idle`)
const sourceSyncError = ref(``)
const sourceStatusText = computed(() => {
  if (sourceSyncState.value === `error`) {
    return `同步失败`
  }
  if (sourceSyncState.value === `syncing`) {
    return `同步中`
  }
  return `已同步`
})

let progressTimer: ReturnType<typeof window.setInterval> | null = null
let sourceApplyTimer: ReturnType<typeof window.setTimeout> | null = null
let htmlEditor: HtmlEditorBridge | null = null
let sourceCodeEditor: CodeMirror.EditorFromTextArea | null = null
let isApplyingSourceToPreview = false
let isSourceEditorFocused = false
let isSyncingSourceEditorValue = false

const ADVANCED_MODE_STORAGE_KEY = `wx-editor:html-advanced-mode`
const NIGHT_MODE_STORAGE_KEY = `wx-editor:html-night-mode`
const SOURCE_VIEW_STORAGE_KEY = `wx-editor:html-source-view`
const ADVANCED_MODE_TOGGLE_EVENT = `wx-editor:advanced-block-tools-toggle`
const SOURCE_APPLY_DEBOUNCE_MS = 320

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

const stopSourceApplyTimer = () => {
  if (sourceApplyTimer !== null) {
    window.clearTimeout(sourceApplyTimer)
    sourceApplyTimer = null
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

const readSourceView = () => {
  if (typeof window === `undefined`) {
    return false
  }
  return window.localStorage.getItem(SOURCE_VIEW_STORAGE_KEY) === `1`
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

const applySourceView = (enabled: boolean) => {
  if (typeof window === `undefined`) {
    return
  }
  window.localStorage.setItem(SOURCE_VIEW_STORAGE_KEY, enabled ? `1` : `0`)
}

const getSourceEditorTheme = () => (nightModeEnabled.value ? `darcula` : `xq-light`)

const getCurrentSourceCode = () => (sourceCodeEditor ? sourceCodeEditor.getValue() : sourceCode.value)

const syncSourceEditorValue = (nextHtml: string) => {
  sourceCode.value = nextHtml

  if (!sourceCodeEditor || sourceCodeEditor.getValue() === nextHtml) {
    return
  }

  isSyncingSourceEditorValue = true
  sourceCodeEditor.setValue(nextHtml)
  isSyncingSourceEditorValue = false
}

const toggleNightMode = () => {
  nightModeEnabled.value = !nightModeEnabled.value
  applyNightMode(nightModeEnabled.value)
}

const syncSourceFromPreview = (force = false) => {
  if (!htmlEditor || htmlEditor.isDestroyed) {
    return
  }
  if (!force && isSourceEditorFocused) {
    return
  }
  syncSourceEditorValue(htmlEditor.getHTML())
  sourceSyncState.value = `idle`
  sourceSyncError.value = ``
}

const handleEditorUpdate = () => {
  if (isApplyingSourceToPreview) {
    isApplyingSourceToPreview = false
    sourceSyncState.value = `idle`
    sourceSyncError.value = ``
    return
  }
  syncSourceFromPreview()
}

const applySourceToPreviewNow = () => {
  stopSourceApplyTimer()

  if (!htmlEditor || htmlEditor.isDestroyed) {
    return
  }

  const nextHtml = getCurrentSourceCode()
  const currentHtml = htmlEditor.getHTML()

  if (nextHtml === currentHtml) {
    sourceSyncState.value = `idle`
    sourceSyncError.value = ``
    return
  }

  try {
    sourceSyncState.value = `syncing`
    sourceSyncError.value = ``
    isApplyingSourceToPreview = true

    const applied = htmlEditor.commands.setContent(nextHtml, true, {
      preserveWhitespace: `full`,
    })

    if (applied === false) {
      throw new Error(`源码未能应用到预览`)
    }

    window.setTimeout(() => {
      if (!isApplyingSourceToPreview) {
        return
      }
      isApplyingSourceToPreview = false
      sourceSyncState.value = `idle`
    }, 0)
  } catch (error) {
    isApplyingSourceToPreview = false
    sourceSyncState.value = `error`
    sourceSyncError.value = error instanceof Error
      ? error.message
      : `源码同步失败，请检查 HTML 内容`
  }
}

const scheduleSourceApply = () => {
  if (!sourceViewEnabled.value) {
    return
  }

  sourceSyncState.value = `syncing`
  sourceSyncError.value = ``
  stopSourceApplyTimer()
  sourceApplyTimer = window.setTimeout(() => {
    applySourceToPreviewNow()
  }, SOURCE_APPLY_DEBOUNCE_MS)
}

const handleSourceEditorChange = (instance: CodeMirror.Editor) => {
  if (isSyncingSourceEditorValue) {
    return
  }

  sourceCode.value = instance.getValue()
  scheduleSourceApply()
}

const createSourceCodeEditor = () => {
  if (sourceCodeEditor || !sourceEditorTextarea.value) {
    return
  }

  const sourceEditorConfig: CodeMirror.EditorConfiguration & Record<string, unknown> = {
    mode: `text/html`,
    theme: getSourceEditorTheme(),
    lineNumbers: true,
    lineWrapping: true,
    styleActiveLine: true,
    autoCloseBrackets: true,
    dragDrop: false,
    inputStyle: `contenteditable`,
    spellcheck: false,
    indentUnit: 2,
    tabSize: 2,
    matchTags: { bothTags: true },
    autoCloseTags: true,
    extraKeys: {
      Tab: (instance: CodeMirror.Editor) => {
        if (instance.somethingSelected()) {
          instance.indentSelection(`add`)
          return
        }

        instance.replaceSelection(`  `, `end`)
      },
      [`Shift-Tab`]: (instance: CodeMirror.Editor) => {
        instance.indentSelection(`subtract`)
      },
      [`Ctrl-S`]: () => {
        applySourceToPreviewNow()
      },
      [`Cmd-S`]: () => {
        applySourceToPreviewNow()
      },
    },
  }

  sourceCodeEditor = markRaw(CodeMirror.fromTextArea(sourceEditorTextarea.value, sourceEditorConfig))
  sourceCodeEditor.on(`change`, handleSourceEditorChange)
  sourceCodeEditor.on(`focus`, handleSourceEditorFocus)
  sourceCodeEditor.on(`blur`, handleSourceEditorBlur)
  syncSourceEditorValue(sourceCode.value)
}

const ensureSourceCodeEditorReady = async (focus = false) => {
  if (!isBootstrapped.value) {
    return
  }

  await nextTick()
  createSourceCodeEditor()

  if (!sourceCodeEditor) {
    return
  }

  sourceCodeEditor.refresh()

  if (focus) {
    sourceCodeEditor.focus()
  }
}

const toggleSourceView = () => {
  sourceViewEnabled.value = !sourceViewEnabled.value
  applySourceView(sourceViewEnabled.value)

  if (sourceViewEnabled.value) {
    syncSourceFromPreview(true)
    void ensureSourceCodeEditorReady(true)
  } else {
    stopSourceApplyTimer()
    isSourceEditorFocused = false
  }
}

const refreshSourceFromPreview = () => {
  stopSourceApplyTimer()
  syncSourceFromPreview(true)
}

const handleSourceEditorFocus = () => {
  isSourceEditorFocused = true
}

const handleSourceEditorBlur = () => {
  isSourceEditorFocused = false
}

onMounted(async () => {
  advancedModeEnabled.value = readAdvancedMode()
  nightModeEnabled.value = readNightMode()
  sourceViewEnabled.value = readSourceView()
  applyAdvancedMode(advancedModeEnabled.value)
  applyNightMode(nightModeEnabled.value)
  applySourceView(sourceViewEnabled.value)
  startProgressSimulation()

  if (tiptapRoot.value) {
    tiptapRoot.value.innerHTML = appShellBody
  }

  if (!isBootstrapped.value) {
    await nextTick()
    await import(`@/html-mode/tiptap-appmsg-editor/main.js`)
    const editorModule = await import(`@/html-mode/tiptap-appmsg-editor/js/editor.js`)
    htmlEditor = editorModule.default as HtmlEditorBridge
    htmlEditor.on(`update`, handleEditorUpdate)
    syncSourceFromPreview(true)
    stopProgressSimulation()
    loadProgress.value = 100
    await new Promise((resolve) => {
      window.setTimeout(resolve, 180)
    })
    isBootstrapped.value = true

    if (sourceViewEnabled.value) {
      await ensureSourceCodeEditorReady(true)
    }
  }
})

watch(nightModeEnabled, (enabled) => {
  sourceCodeEditor?.setOption(`theme`, enabled ? `darcula` : `xq-light`)

  if (sourceViewEnabled.value) {
    window.requestAnimationFrame(() => {
      sourceCodeEditor?.refresh()
    })
  }
})

onBeforeUnmount(() => {
  stopProgressSimulation()
  stopSourceApplyTimer()
  if (htmlEditor && !htmlEditor.isDestroyed) {
    htmlEditor.off(`update`, handleEditorUpdate)
  }
  if (sourceCodeEditor) {
    sourceCodeEditor.toTextArea()
    sourceCodeEditor = null
  }
})
</script>

<template>
  <div class="html-mode-page" :class="{ 'is-night': nightModeEnabled, 'is-source-view': sourceViewEnabled }">
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
          class="source-toggle-btn icon-toggle-btn"
          :class="{ 'is-enabled': sourceViewEnabled }"
          :aria-pressed="sourceViewEnabled"
          :aria-label="`源码视图${sourceViewEnabled ? '已开启' : '已关闭'}`"
          :title="`源码视图${sourceViewEnabled ? '已开启' : '已关闭'}`"
          :data-tooltip="`源码视图${sourceViewEnabled ? '已开启' : '已关闭'}`"
          @click="toggleSourceView"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M8.5 7.5L4.5 12L8.5 16.5M15.5 7.5L19.5 12L15.5 16.5M13.5 5L10.5 19"
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
      <aside v-if="isBootstrapped" v-show="sourceViewEnabled" class="html-source-panel">
        <div class="html-source-panel__header">
          <div class="html-source-panel__heading">
            <div class="html-source-panel__kicker">Source</div>
            <div class="html-source-panel__title">源码视图</div>
          </div>
          <span class="html-source-panel__status" :class="`is-${sourceSyncState}`">
            {{ sourceStatusText }}
          </span>
        </div>
        <div class="html-source-panel__note">
          直接编辑 HTML，约 {{ SOURCE_APPLY_DEBOUNCE_MS }}ms 自动同步到预览。打开源码视图后，左侧模板/资源面板会隐藏。
        </div>
        <div v-if="sourceSyncState === 'error' && sourceSyncError" class="html-source-panel__error">
          {{ sourceSyncError }}
        </div>
        <div class="html-source-panel__actions">
          <button type="button" class="html-source-panel__btn" @click="refreshSourceFromPreview">
            从预览载入
          </button>
          <button type="button" class="html-source-panel__btn html-source-panel__btn-primary" @click="applySourceToPreviewNow">
            立即同步
          </button>
        </div>
        <div class="html-source-panel__editor-shell">
          <textarea
            ref="sourceEditorTextarea"
            class="html-source-panel__editor-textarea"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
          />
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped lang="less">
.html-mode-page {
  --html-source-panel-width: clamp(320px, 24vw, 460px);
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
.source-toggle-btn,
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

.source-toggle-btn.is-enabled {
  border-color: rgba(245, 158, 11, 0.45);
  color: #92400e;
  background: rgba(254, 243, 199, 0.95);
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
.html-mode-page.is-night .source-toggle-btn,
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

.html-mode-page.is-night .source-toggle-btn.is-enabled {
  border-color: rgba(251, 191, 36, 0.62);
  color: #fde68a;
  background: rgba(120, 53, 15, 0.72);
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

.html-mode-page.is-source-view :deep(.sidebar) {
  display: none;
}

.html-mode-page.is-source-view :deep(.editor-wrapper) {
  padding-left: var(--html-source-panel-width);
}

.html-source-panel {
  position: absolute;
  top: 90px;
  bottom: 0;
  left: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  width: var(--html-source-panel-width);
  max-width: calc(100% - 80px);
  padding: 18px 16px 16px;
  border-right: 1px solid rgba(226, 232, 240, 0.9);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 12px 0 30px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(12px);
}

.html-source-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.html-source-panel__heading {
  min-width: 0;
}

.html-source-panel__kicker {
  color: #c2410c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.html-source-panel__title {
  margin-top: 4px;
  color: #0f172a;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}

.html-source-panel__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.html-source-panel__status.is-idle {
  color: #166534;
  background: rgba(220, 252, 231, 0.95);
}

.html-source-panel__status.is-syncing {
  color: #92400e;
  background: rgba(254, 243, 199, 0.95);
}

.html-source-panel__status.is-error {
  color: #991b1b;
  background: rgba(254, 226, 226, 0.95);
}

.html-source-panel__note {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.55;
  background: rgba(248, 250, 252, 0.95);
}

.html-source-panel__error {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(248, 113, 113, 0.26);
  border-radius: 12px;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.5;
  background: rgba(254, 242, 242, 0.96);
}

.html-source-panel__actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.html-source-panel__btn {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(203, 213, 225, 0.96);
  border-radius: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  background: rgba(248, 250, 252, 0.98);
}

.html-source-panel__btn:hover {
  background: rgba(241, 245, 249, 0.98);
}

.html-source-panel__btn-primary {
  border-color: rgba(245, 158, 11, 0.34);
  color: #92400e;
  background: rgba(254, 243, 199, 0.96);
}

.html-source-panel__btn-primary:hover {
  background: rgba(253, 230, 138, 0.98);
}

.html-source-panel__editor-shell {
  flex: 1;
  width: 100%;
  min-height: 0;
  margin-top: 12px;
  border: 1px solid rgba(203, 213, 225, 0.95);
  border-radius: 14px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
}

.html-source-panel__editor-shell:focus-within {
  border-color: rgba(245, 158, 11, 0.58);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.18);
}

.html-source-panel__editor-textarea {
  display: none;
}

.html-source-panel__editor-shell :deep(.CodeMirror) {
  height: 100%;
  font-size: 12px;
  line-height: 1.65;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.html-source-panel__editor-shell :deep(.CodeMirror-scroll) {
  min-height: 100%;
}

.html-source-panel__editor-shell :deep(.CodeMirror-lines) {
  padding: 12px 0;
}

.html-source-panel__editor-shell :deep(.CodeMirror pre),
.html-source-panel__editor-shell :deep(.CodeMirror-linenumber) {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

.html-source-panel__editor-shell :deep(.cm-s-xq-light.CodeMirror) {
  background: rgba(255, 255, 255, 0.98);
}

.html-source-panel__editor-shell :deep(.cm-s-xq-light .CodeMirror-gutters) {
  border-right: 1px solid rgba(226, 232, 240, 0.96);
  background: rgba(248, 250, 252, 0.98);
}

.html-mode-page.is-night .html-source-panel {
  border-right-color: rgba(51, 65, 85, 0.92);
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 12px 0 30px rgba(2, 6, 23, 0.28);
}

.html-mode-page.is-night .html-source-panel__kicker {
  color: #fdba74;
}

.html-mode-page.is-night .html-source-panel__title {
  color: #e2e8f0;
}

.html-mode-page.is-night .html-source-panel__status.is-idle {
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.56);
}

.html-mode-page.is-night .html-source-panel__status.is-syncing {
  color: #fde68a;
  background: rgba(120, 53, 15, 0.74);
}

.html-mode-page.is-night .html-source-panel__status.is-error {
  color: #fecaca;
  background: rgba(127, 29, 29, 0.78);
}

.html-mode-page.is-night .html-source-panel__note {
  color: #94a3b8;
  background: rgba(30, 41, 59, 0.84);
}

.html-mode-page.is-night .html-source-panel__error {
  border-color: rgba(248, 113, 113, 0.28);
  color: #fca5a5;
  background: rgba(69, 10, 10, 0.78);
}

.html-mode-page.is-night .html-source-panel__btn {
  border-color: rgba(71, 85, 105, 0.92);
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.92);
}

.html-mode-page.is-night .html-source-panel__btn:hover {
  background: rgba(30, 41, 59, 0.96);
}

.html-mode-page.is-night .html-source-panel__btn-primary {
  border-color: rgba(251, 191, 36, 0.38);
  color: #fde68a;
  background: rgba(120, 53, 15, 0.76);
}

.html-mode-page.is-night .html-source-panel__btn-primary:hover {
  background: rgba(146, 64, 14, 0.84);
}

.html-mode-page.is-night .html-source-panel__editor-shell {
  border-color: rgba(71, 85, 105, 0.92);
  background: rgba(2, 6, 23, 0.92);
}

.html-mode-page.is-night .html-source-panel__editor-shell:focus-within {
  border-color: rgba(251, 191, 36, 0.5);
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
}

.html-mode-page.is-night .html-source-panel__editor-shell :deep(.cm-s-darcula.CodeMirror) {
  background: rgba(2, 6, 23, 0.92);
}

.html-mode-page.is-night .html-source-panel__editor-shell :deep(.cm-s-darcula .CodeMirror-gutters) {
  border-right: 1px solid rgba(51, 65, 85, 0.92);
  background: rgba(15, 23, 42, 0.9);
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

.html-mode-page.is-night :deep(.wx-style-inspector-panel) {
  border-color: rgba(71, 85, 105, 0.88);
  background: rgba(15, 23, 42, 0.96);
  box-shadow: 0 22px 44px rgba(2, 6, 23, 0.58);
}

.html-mode-page.is-night :deep(.wx-style-inspector-header) {
  border-bottom-color: rgba(51, 65, 85, 0.9);
}

.html-mode-page.is-night :deep(.wx-style-inspector-kicker) {
  color: #86efac;
}

.html-mode-page.is-night :deep(.wx-style-inspector-title) {
  color: #e2e8f0;
}

.html-mode-page.is-night :deep(.wx-style-inspector-meta),
.html-mode-page.is-night :deep(.wx-style-inspector-empty),
.html-mode-page.is-night :deep(.wx-style-inspector-note) {
  color: #94a3b8;
}

.html-mode-page.is-night :deep(.wx-style-inspector-badge) {
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.54);
}

.html-mode-page.is-night :deep(.wx-style-inspector-icon-btn) {
  border-color: #334155;
  color: #cbd5e1;
  background: rgba(30, 41, 59, 0.86);
}

.html-mode-page.is-night :deep(.wx-style-inspector-icon-btn:hover) {
  color: #e2e8f0;
  background: rgba(51, 65, 85, 0.9);
}

.html-mode-page.is-night :deep(.wx-style-inspector-empty) {
  border-color: rgba(71, 85, 105, 0.9);
  background: rgba(15, 23, 42, 0.72);
}

.html-mode-page.is-night :deep(.wx-style-inspector-note) {
  background: rgba(30, 41, 59, 0.78);
}

.html-mode-page.is-night :deep(.wx-style-inspector-sources) {
  border-color: rgba(34, 197, 94, 0.26);
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.34), rgba(15, 23, 42, 0.72));
}

.html-mode-page.is-night :deep(.wx-style-inspector-sources-title),
.html-mode-page.is-night :deep(.wx-style-inspector-source-label) {
  color: #bbf7d0;
}

.html-mode-page.is-night :deep(.wx-style-inspector-source-item) {
  border-color: rgba(22, 101, 52, 0.58);
  background: rgba(15, 23, 42, 0.64);
}

.html-mode-page.is-night :deep(.wx-style-inspector-source-value) {
  color: #94a3b8;
}

.html-mode-page.is-night :deep(.wx-style-inspector-source-jump) {
  border-color: rgba(34, 197, 94, 0.42);
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.52);
}

.html-mode-page.is-night :deep(.wx-style-inspector-source-jump:hover) {
  background: rgba(21, 128, 61, 0.72);
}

.html-mode-page.is-night :deep(.wx-style-inspector-label) {
  color: #cbd5e1;
}

.html-mode-page.is-night :deep(.wx-style-inspector-input),
.html-mode-page.is-night :deep(.wx-style-inspector-textarea),
.html-mode-page.is-night :deep(.wx-style-inspector-color-picker) {
  border-color: #334155;
  color: #e2e8f0;
  background: #0b1220;
}

.html-mode-page.is-night :deep(.wx-style-inspector-input[data-mixed='1']),
.html-mode-page.is-night :deep(.wx-style-inspector-textarea[data-mixed='1']),
.html-mode-page.is-night :deep(.wx-style-inspector-color-picker[data-mixed='1']) {
  background: rgba(30, 41, 59, 0.68);
}

.html-mode-page.is-night :deep(.wx-style-inspector-input:focus),
.html-mode-page.is-night :deep(.wx-style-inspector-textarea:focus),
.html-mode-page.is-night :deep(.wx-style-inspector-color-picker:focus) {
  border-color: rgba(74, 222, 128, 0.72);
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2);
}

.html-mode-page.is-night :deep(.wx-style-inspector-btn) {
  border-color: rgba(34, 197, 94, 0.42);
  color: #bbf7d0;
  background: rgba(22, 101, 52, 0.52);
}

.html-mode-page.is-night :deep(.wx-style-inspector-btn:hover) {
  background: rgba(21, 128, 61, 0.72);
}

.html-mode-page.is-night :deep(.wx-style-inspector-btn-secondary) {
  border-color: #334155;
  color: #cbd5e1;
  background: rgba(30, 41, 59, 0.88);
}

.html-mode-page.is-night :deep(.wx-style-inspector-btn-secondary:hover) {
  background: rgba(51, 65, 85, 0.92);
}

.html-mode-page.is-night :deep(.wx-style-inspector-fab) {
  border-color: rgba(71, 85, 105, 0.75);
  color: #cbd5e1;
  background: rgba(15, 23, 42, 0.88);
  box-shadow: 0 10px 26px rgba(2, 6, 23, 0.5);
}

.html-mode-page.is-night :deep(.wx-style-inspector-fab:hover) {
  background: rgba(30, 41, 59, 0.94);
}

.html-mode-page.is-night :deep(.wx-style-inspector-fab.is-active) {
  border-color: rgba(34, 197, 94, 0.58);
  color: #86efac;
  background: rgba(6, 78, 59, 0.65);
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
