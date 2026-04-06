export type TextVideoAspectRatio = '9:16' | '16:9' | '1:1'

export interface CreateTextVideoOptions {
  title: string
  content: string
  aspectRatio: TextVideoAspectRatio
  sceneDurationSeconds: number
  audioBlob?: Blob
  fps?: number
  maxScenes?: number
  onProgress?: (progress: number) => void
}

const ASPECT_RATIO_PRESETS: Record<TextVideoAspectRatio, { width: number, height: number }> = {
  '9:16': { width: 720, height: 1280 },
  '16:9': { width: 1280, height: 720 },
  '1:1': { width: 1080, height: 1080 },
}

const DEFAULT_FONT_STACK = `"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`

function stripMarkdown(raw: string) {
  return raw
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
}

function splitLongSegment(text: string, maxChars = 110) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }
  if (normalized.length <= maxChars) {
    return [normalized]
  }

  const segments: string[] = []
  let current = ''
  for (const char of normalized) {
    current += char
    const hitLimit = current.length >= maxChars
    const hitPunctuation = /[。！？.!?；;，,]/.test(char)
    if (hitLimit && hitPunctuation) {
      segments.push(current.trim())
      current = ''
    }
  }

  if (current.trim()) {
    segments.push(current.trim())
  }

  return segments
}

function buildScenesFromArticle(content: string, maxScenes = 24) {
  const plainText = stripMarkdown(content)
  const paragraphs = plainText
    .split(/\n{2,}/)
    .map(item => item.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  const scenes: string[] = []
  for (const paragraph of paragraphs) {
    const subSegments = splitLongSegment(paragraph)
    for (const segment of subSegments) {
      scenes.push(segment)
      if (scenes.length >= maxScenes) {
        return scenes
      }
    }
  }

  return scenes
}

function wrapTextByWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = []
  let current = ''

  for (const char of text) {
    const candidate = `${current}${char}`
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate
      continue
    }

    lines.push(current)
    current = char
  }

  if (current) {
    lines.push(current)
  }

  return lines
}

function getScenePalette(index: number) {
  const palettes = [
    ['#0f172a', '#1d4ed8'],
    ['#1f2937', '#0ea5e9'],
    ['#111827', '#9333ea'],
    ['#0b132b', '#14b8a6'],
    ['#1e1b4b', '#f59e0b'],
  ]
  return palettes[index % palettes.length]
}

function drawFrame(options: {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  title: string
  sceneText: string
  sceneIndex: number
  sceneProgress: number
  totalScenes: number
  totalProgress: number
}) {
  const {
    ctx,
    width,
    height,
    title,
    sceneText,
    sceneIndex,
    sceneProgress,
    totalScenes,
    totalProgress,
  } = options

  const [startColor, endColor] = getScenePalette(sceneIndex)
  const background = ctx.createLinearGradient(0, 0, width, height)
  background.addColorStop(0, startColor)
  background.addColorStop(1, endColor)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, width, height)

  const glowX = width * (0.15 + 0.7 * sceneProgress)
  const glowY = height * 0.2
  const glow = ctx.createRadialGradient(glowX, glowY, 10, glowX, glowY, width * 0.35)
  glow.addColorStop(0, 'rgba(255,255,255,0.24)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, width, height)

  const cardWidth = width * 0.84
  const cardX = (width - cardWidth) / 2
  const cardY = height * 0.24
  const cardHeight = height * 0.56
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'
  ctx.fillRect(cardX, cardY, cardWidth, cardHeight)

  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.font = `600 ${Math.max(30, Math.round(width * 0.038))}px ${DEFAULT_FONT_STACK}`
  const titleLines = wrapTextByWidth(ctx, title || '文转视频', cardWidth - 56).slice(0, 2)
  titleLines.forEach((line, index) => {
    ctx.fillText(line, cardX + 28, cardY + 60 + index * 46)
  })

  ctx.fillStyle = 'rgba(226,232,240,0.98)'
  ctx.font = `500 ${Math.max(28, Math.round(width * 0.035))}px ${DEFAULT_FONT_STACK}`
  const contentLines = wrapTextByWidth(ctx, sceneText, cardWidth - 56).slice(0, 8)
  contentLines.forEach((line, index) => {
    ctx.fillText(line, cardX + 28, cardY + 154 + index * 44)
  })

  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.font = `500 ${Math.max(20, Math.round(width * 0.022))}px ${DEFAULT_FONT_STACK}`
  ctx.fillText(`镜头 ${sceneIndex + 1}/${totalScenes}`, cardX + 28, cardY + cardHeight - 24)

  const progressBarWidth = width * 0.84
  const progressBarHeight = 12
  const progressBarX = (width - progressBarWidth) / 2
  const progressBarY = height - 48

  ctx.fillStyle = 'rgba(255,255,255,0.28)'
  ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight)
  ctx.fillStyle = 'rgba(56,189,248,0.95)'
  ctx.fillRect(progressBarX, progressBarY, progressBarWidth * totalProgress, progressBarHeight)
}

function pickSupportedMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return null
  }

  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate
    }
  }

  return null
}

function sanitizeVideoFileName(raw: string) {
  return raw
    .trim()
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 42) || 'text-video'
}

interface AudioTrackResource {
  track: MediaStreamTrack
  start: () => void
  stop: () => Promise<void>
}

async function createAudioTrackResource(audioBlob: Blob, targetDurationSeconds: number): Promise<AudioTrackResource> {
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
  if (!AudioContextCtor) {
    throw new TypeError('当前浏览器不支持 AudioContext，无法合成音轨')
  }

  const audioContext = new AudioContextCtor()
  const rawAudio = await audioBlob.arrayBuffer()
  const decodedBuffer = await audioContext.decodeAudioData(rawAudio.slice(0))

  const sourceNode = audioContext.createBufferSource()
  sourceNode.buffer = decodedBuffer

  const gainNode = audioContext.createGain()
  gainNode.gain.value = 1
  const destinationNode = audioContext.createMediaStreamDestination()

  sourceNode.connect(gainNode)
  gainNode.connect(destinationNode)

  const track = destinationNode.stream.getAudioTracks()[0]
  if (!track) {
    await audioContext.close()
    throw new Error('音频轨道创建失败')
  }

  const maxDuration = Math.max(0.1, targetDurationSeconds)
  let started = false

  const start = () => {
    if (started) {
      return
    }
    started = true

    if (audioContext.state === 'suspended') {
      void audioContext.resume()
    }

    if (decodedBuffer.duration > maxDuration) {
      sourceNode.start(0, 0, maxDuration)
    }
    else {
      sourceNode.start(0)
    }
  }

  const stop = async () => {
    try {
      sourceNode.stop()
    }
    catch {}
    track.stop()
    await audioContext.close().catch(() => {})
  }

  return { track, start, stop }
}

export async function createTextVideoBlob(options: CreateTextVideoOptions): Promise<Blob> {
  if (typeof window === 'undefined') {
    throw new TypeError('当前环境不支持视频导出')
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new TypeError('当前浏览器不支持 MediaRecorder，无法导出视频')
  }

  const sceneDuration = Math.min(15, Math.max(2, Math.round(options.sceneDurationSeconds || 4)))
  const fps = Math.min(30, Math.max(12, Math.round(options.fps || 24)))
  const preset = ASPECT_RATIO_PRESETS[options.aspectRatio]
  const scenes = buildScenesFromArticle(options.content, options.maxScenes ?? 24)

  if (!scenes.length) {
    throw new Error('文章内容为空，无法生成视频')
  }

  const canvas = document.createElement('canvas')
  canvas.width = preset.width
  canvas.height = preset.height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('无法创建 Canvas 上下文')
  }

  const totalDuration = scenes.length * sceneDuration
  const canvasStream = canvas.captureStream(fps)
  const audioTrackResource = options.audioBlob
    ? await createAudioTrackResource(options.audioBlob, totalDuration)
    : null
  const mergedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(audioTrackResource ? [audioTrackResource.track] : []),
  ])
  const mimeType = pickSupportedMimeType()
  const recorder = mimeType
    ? new MediaRecorder(mergedStream, { mimeType })
    : new MediaRecorder(mergedStream)
  const chunks: BlobPart[] = []

  let frameHandle = 0
  let hasStopped = false

  const blobPromise = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data)
      }
    }

    recorder.onerror = (event) => {
      reject((event as ErrorEvent).error || new Error('视频录制失败'))
    }

    recorder.onstop = () => {
      hasStopped = true
      mergedStream.getTracks().forEach(track => track.stop())
      if (audioTrackResource) {
        void audioTrackResource.stop()
      }
      resolve(new Blob(chunks, { type: mimeType || 'video/webm' }))
    }
  })

  drawFrame({
    ctx,
    width: preset.width,
    height: preset.height,
    title: options.title,
    sceneText: scenes[0],
    sceneIndex: 0,
    sceneProgress: 0,
    totalScenes: scenes.length,
    totalProgress: 0,
  })

  recorder.start(1000)
  audioTrackResource?.start()
  const startTime = performance.now()

  const render = () => {
    const elapsedSeconds = (performance.now() - startTime) / 1000
    const clampedElapsed = Math.min(elapsedSeconds, totalDuration)
    const totalProgress = clampedElapsed / totalDuration

    const sceneIndex = Math.min(scenes.length - 1, Math.floor(clampedElapsed / sceneDuration))
    const sceneElapsed = clampedElapsed - sceneIndex * sceneDuration
    const sceneProgress = sceneElapsed / sceneDuration

    drawFrame({
      ctx,
      width: preset.width,
      height: preset.height,
      title: options.title,
      sceneText: scenes[sceneIndex],
      sceneIndex,
      sceneProgress,
      totalScenes: scenes.length,
      totalProgress,
    })

    options.onProgress?.(totalProgress)

    if (clampedElapsed >= totalDuration) {
      if (!hasStopped && recorder.state !== 'inactive') {
        recorder.stop()
      }
      return
    }

    frameHandle = requestAnimationFrame(render)
  }

  frameHandle = requestAnimationFrame(render)

  try {
    const blob = await blobPromise
    options.onProgress?.(1)
    return blob
  }
  finally {
    cancelAnimationFrame(frameHandle)
    if (!hasStopped && recorder.state !== 'inactive') {
      recorder.stop()
    }
  }
}

export function downloadVideoBlob(blob: Blob, rawFileName: string) {
  const fileName = sanitizeVideoFileName(rawFileName)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${fileName}.webm`
  document.body.appendChild(link)
  link.click()
  link.remove()

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 1500)
}
