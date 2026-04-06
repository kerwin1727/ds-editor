export type ChatAttachmentKind = 'text' | 'docx' | 'image' | 'pdf' | 'unsupported'

export interface ParsedChatAttachment {
  id: string
  name: string
  mimeType: string
  size: number
  kind: ChatAttachmentKind
  summary: string
  excerpt?: string
}

const TEXT_FILE_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'tsv',
  'html',
  'xml',
  'yaml',
  'yml',
  'log',
])

const MAX_TEXT_EXCERPT_LENGTH = 6000
const MAX_CONTEXT_EXCERPT_LENGTH = 12000
const MAX_PDF_PARSE_SIZE = 30 * 1024 * 1024
const MAX_PDF_PARSE_PAGES = 20
const MAX_OCR_FILE_SIZE = 10 * 1024 * 1024
const OCR_LANGUAGES = 'chi_sim+eng'
const OCR_MAX_IMAGE_SIDE = 2200
const OCR_LOW_CONFIDENCE_THRESHOLD = 55

export const CHAT_ATTACHMENT_ACCEPT = '.txt,.md,.markdown,.json,.csv,.tsv,.html,.xml,.yaml,.yml,.log,.docx,.pdf,image/*'

function getFileExtension(fileName: string) {
  const index = fileName.lastIndexOf('.')
  if (index < 0 || index === fileName.length - 1) {
    return ''
  }
  return fileName.slice(index + 1).toLowerCase()
}

function normalizeTextContent(raw: string) {
  return raw
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function trimTextForExcerpt(raw: string, maxLength = MAX_TEXT_EXCERPT_LENGTH) {
  const normalized = normalizeTextContent(raw)
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength)}\n...(内容已截断)`
}

function getReadableFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes}B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

async function getImageDimensions(file: File) {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      const dims = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dims
    }
  }
  catch {}

  return await new Promise<{ width: number, height: number } | null>((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const result = { width: image.naturalWidth, height: image.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(result)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    image.src = url
  })
}

async function extractDocxText(file: File) {
  const mammothModule: any = await import('mammoth')
  const extractRawText = mammothModule.extractRawText || mammothModule.default?.extractRawText
  if (typeof extractRawText !== 'function') {
    throw new TypeError('DOCX 解析器不可用')
  }

  const arrayBuffer = await file.arrayBuffer()
  const result = await extractRawText({ arrayBuffer })
  return normalizeTextContent(result?.value || '')
}

async function extractPdfText(file: File) {
  const pdfjsModule: any = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const getDocument = pdfjsModule.getDocument || pdfjsModule.default?.getDocument
  if (typeof getDocument !== 'function') {
    throw new TypeError('PDF 解析器不可用')
  }

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  })
  const pdfDocument = await loadingTask.promise
  const pageCount = Number(pdfDocument.numPages || 0)
  const parsedPages = Math.min(pageCount, MAX_PDF_PARSE_PAGES)
  const pageTexts: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= parsedPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const pageText = (textContent.items || [])
        .map((item: any) => (typeof item?.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ')

      if (pageText.trim()) {
        pageTexts.push(pageText)
      }
    }
  }
  finally {
    try {
      await pdfDocument.destroy?.()
    }
    catch {}
  }

  return {
    text: normalizeTextContent(pageTexts.join('\n\n')),
    pageCount,
    parsedPages,
  }
}

function getOcrTextQualityScore(text: string, confidence: number) {
  const compactText = text.replace(/\s+/g, '')
  const total = compactText.length || 1
  const chineseCount = (compactText.match(/[\u4E00-\u9FFF]/g) || []).length
  const alnumCount = (compactText.match(/[A-Za-z0-9]/g) || []).length
  const punctuationCount = (compactText.match(/[，。！？：；、,.!?;:]/g) || []).length
  const noiseCount = Math.max(total - chineseCount - alnumCount - punctuationCount, 0)
  const meaningfulRatio = (chineseCount + alnumCount + punctuationCount * 0.7) / total

  return confidence * 1.6
    + Math.min(text.length, 500) * 0.12
    + meaningfulRatio * 80
    - noiseCount * 0.8
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

async function loadImageElement(file: File) {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('无法读取图片'))
    }
    image.src = url
  })
}

function buildBaseOcrCanvas(image: HTMLImageElement) {
  const naturalWidth = image.naturalWidth || image.width
  const naturalHeight = image.naturalHeight || image.height
  const maxSide = Math.max(naturalWidth, naturalHeight)
  const scale = maxSide > OCR_MAX_IMAGE_SIDE ? (OCR_MAX_IMAGE_SIDE / maxSide) : 1
  const canvas = createCanvas(naturalWidth * scale, naturalHeight * scale)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('无法创建 OCR 画布上下文')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas
}

function cloneCanvas(source: HTMLCanvasElement) {
  const canvas = createCanvas(source.width, source.height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('无法复制 OCR 画布')
  }

  context.drawImage(source, 0, 0)
  return canvas
}

function applyOcrPreprocess(source: HTMLCanvasElement, options: { threshold?: number }) {
  const canvas = cloneCanvas(source)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new Error('无法处理 OCR 画布')
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { data } = imageData
  const threshold = options.threshold

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    // 灰度 + 轻度对比增强，减弱背景噪点影响
    let gray = 0.299 * r + 0.587 * g + 0.114 * b
    gray = (gray - 128) * 1.18 + 128
    gray = Math.min(255, Math.max(0, gray))

    if (typeof threshold === 'number') {
      gray = gray > threshold ? 255 : 0
    }

    data[i] = gray
    data[i + 1] = gray
    data[i + 2] = gray
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

async function extractImageTextByOCR(file: File) {
  const tesseractModule: any = await import('tesseract.js')
  const createWorker = tesseractModule.createWorker || tesseractModule.default?.createWorker
  if (typeof createWorker !== 'function') {
    throw new TypeError('OCR 解析器不可用')
  }

  const image = await loadImageElement(file)
  const baseCanvas = buildBaseOcrCanvas(image)
  const grayCanvas = applyOcrPreprocess(baseCanvas, {})
  const binaryCanvas = applyOcrPreprocess(baseCanvas, { threshold: 160 })

  const worker = await createWorker(OCR_LANGUAGES)
  try {
    const attempts = [
      { input: baseCanvas, psm: '6', strategy: 'origin-psm6' },
      { input: grayCanvas, psm: '6', strategy: 'gray-psm6' },
      { input: binaryCanvas, psm: '6', strategy: 'binary-psm6' },
      { input: grayCanvas, psm: '11', strategy: 'gray-psm11' },
    ]

    let best: { text: string, confidence: number, score: number, strategy: string } | null = null

    for (const attempt of attempts) {
      await worker.setParameters({
        tessedit_pageseg_mode: attempt.psm,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      })

      const result = await worker.recognize(attempt.input)
      const text = normalizeTextContent(result?.data?.text || '')
      const confidence = Number(result?.data?.confidence || 0)
      if (!text) {
        continue
      }

      const score = getOcrTextQualityScore(text, confidence)
      if (!best || score > best.score) {
        best = {
          text,
          confidence,
          score,
          strategy: attempt.strategy,
        }
      }
    }

    return {
      text: best?.text || '',
      confidence: best?.confidence || 0,
      strategy: best?.strategy || '',
    }
  }
  finally {
    await worker.terminate()
  }
}

function shouldTreatAsText(file: File, extension: string) {
  if (TEXT_FILE_EXTENSIONS.has(extension)) {
    return true
  }

  return file.type.startsWith('text/')
    || file.type === 'application/json'
    || file.type === 'application/xml'
}

export async function parseChatAttachment(file: File): Promise<ParsedChatAttachment> {
  const extension = getFileExtension(file.name)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const base: Omit<ParsedChatAttachment, 'kind' | 'summary'> = {
    id,
    name: file.name,
    mimeType: file.type || extension || 'unknown',
    size: file.size,
  }

  if (file.type.startsWith('image/')) {
    const dimensions = await getImageDimensions(file)
    const resolution = dimensions ? `${dimensions.width}x${dimensions.height}` : '未知分辨率'
    if (file.size > MAX_OCR_FILE_SIZE) {
      return {
        ...base,
        kind: 'image',
        summary: `图片文件（${resolution}，${getReadableFileSize(file.size)}）。文件过大，已跳过 OCR。`,
      }
    }

    try {
      const ocrResult = await extractImageTextByOCR(file)
      if (!ocrResult.text) {
        return {
          ...base,
          kind: 'image',
          summary: `图片已完成 OCR（未识别到可用文本，${resolution}，${getReadableFileSize(file.size)}）`,
        }
      }
      const confidenceLabel = `${ocrResult.confidence.toFixed(1)}%`
      const lowConfidenceTip = ocrResult.confidence < OCR_LOW_CONFIDENCE_THRESHOLD
        ? '，置信度偏低，建议人工核对'
        : ''

      return {
        ...base,
        kind: 'image',
        summary: `图片 OCR 已提取文本（${ocrResult.text.length} 字符，${resolution}，置信度 ${confidenceLabel}${lowConfidenceTip}）`,
        excerpt: trimTextForExcerpt(ocrResult.text),
      }
    }
    catch {
      return {
        ...base,
        kind: 'image',
        summary: `图片文件（${resolution}，${getReadableFileSize(file.size)}）。OCR 解析失败，已仅保留元信息。`,
      }
    }
  }

  if (extension === 'pdf' || file.type === 'application/pdf') {
    if (file.size > MAX_PDF_PARSE_SIZE) {
      return {
        ...base,
        kind: 'pdf',
        summary: `PDF 文件（${getReadableFileSize(file.size)}）过大，已跳过正文提取，请补充关键内容。`,
      }
    }

    try {
      const { text, pageCount, parsedPages } = await extractPdfText(file)
      if (!text) {
        return {
          ...base,
          kind: 'pdf',
          summary: `PDF 已解析 ${parsedPages}/${pageCount || parsedPages} 页，但未提取到正文文本（可能是扫描件）。`,
        }
      }

      return {
        ...base,
        kind: 'pdf',
        summary: `PDF 正文已提取（解析 ${parsedPages}/${pageCount || parsedPages} 页，共 ${text.length} 字符）`,
        excerpt: trimTextForExcerpt(text),
      }
    }
    catch {
      return {
        ...base,
        kind: 'pdf',
        summary: `PDF 文件（${getReadableFileSize(file.size)}）。正文解析失败，请补充关键内容。`,
      }
    }
  }

  if (extension === 'docx') {
    const text = await extractDocxText(file)
    return {
      ...base,
      kind: 'docx',
      summary: `DOCX 已提取文本（${text.length} 字符）`,
      excerpt: trimTextForExcerpt(text),
    }
  }

  if (shouldTreatAsText(file, extension)) {
    const text = await file.text()
    const normalized = normalizeTextContent(text)
    return {
      ...base,
      kind: 'text',
      summary: `文本已提取（${normalized.length} 字符）`,
      excerpt: trimTextForExcerpt(normalized),
    }
  }

  return {
    ...base,
    kind: 'unsupported',
    summary: `不支持自动解析的文件类型（${getReadableFileSize(file.size)}），仅保留文件信息。`,
  }
}

export function buildChatAttachmentContext(attachments: ParsedChatAttachment[]) {
  if (!attachments.length) {
    return ''
  }

  let remaining = MAX_CONTEXT_EXCERPT_LENGTH
  const lines: string[] = [
    '[附件上下文]',
    '以下是用户本次上传的附件解析结果，请结合这些信息回答：',
    '',
  ]

  attachments.forEach((attachment, index) => {
    lines.push(`附件${index + 1}：${attachment.name}`)
    lines.push(`类型：${attachment.mimeType || attachment.kind}`)
    lines.push(`大小：${getReadableFileSize(attachment.size)}`)
    lines.push(`说明：${attachment.summary}`)

    if (attachment.excerpt && remaining > 0) {
      const excerpt = attachment.excerpt.slice(0, remaining)
      lines.push('内容节选：')
      lines.push(excerpt)
      remaining -= excerpt.length
    }

    lines.push('')
  })

  return lines.join('\n').trim()
}
