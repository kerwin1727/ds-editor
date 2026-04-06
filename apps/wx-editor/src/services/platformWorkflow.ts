import axios from 'axios'
import { getPlatformWorkflowConfig } from '@/config/platformWorkflowConfig'

type ReviewAction = 'approve' | 'reject' | 'archive'
type PublishAction = 'save_draft' | 'publish'

export interface PendingReviewItem {
  id: string
  reviewStatus: string
  createdAt: string
  raw?: {
    id: string
    title: string
    author?: string
    createdAt: string
  }
}

interface PendingListResponse {
  total: number
  list: PendingReviewItem[]
}

export interface ArticleDetail {
  id: string
  cleanHtml: string
  reviewStatus: string
  raw?: {
    title?: string
    author?: string
  }
}

export interface PublishValidatePayload {
  docId: string
  title: string
  summary?: string
  author?: string
  coverUrl?: string
  contentHtml: string
  channelType: 'wechat'
}

export interface PublishPayload extends PublishValidatePayload {
  actionType: PublishAction
  operatorId: string
}

function getBaseApiUrl() {
  const config = getPlatformWorkflowConfig()
  const fallback = window.location.origin
  const base = config.platformApiBaseUrl?.trim() || fallback
  return base.replace(/\/$/, ``)
}

function buildApiPath(path: string) {
  return `${getBaseApiUrl()}/api${path}`
}

async function get<T>(path: string, params?: Record<string, any>) {
  const response = await axios.get<T>(buildApiPath(path), { params, timeout: 30000 })
  return response.data
}

async function post<T>(path: string, data?: Record<string, any>) {
  const response = await axios.post<T>(buildApiPath(path), data, { timeout: 30000 })
  return response.data
}

export async function createCrawlTask(sourceUrl: string, sourceType: 'single_link' | 'account_batch' = 'single_link') {
  return post<{ taskId: string, articleCleanId: string, status: string }>(`/tasks/crawl`, {
    sourceUrl,
    sourceType,
  })
}

export async function listPendingReviews() {
  return get<PendingListResponse>(`/reviews/pending`)
}

export async function getArticleById(articleId: string) {
  return get<ArticleDetail>(`/articles/${articleId}`)
}

export async function reviewArticle(articleId: string, action: ReviewAction, reviewerId: string, comment?: string) {
  return post<{ articleId: string, reviewStatus: string, reviewId: string }>(`/reviews/${articleId}/${action}`, {
    reviewerId,
    comment,
  })
}

export async function validatePublish(payload: PublishValidatePayload) {
  return post<{ ok: boolean, issues: Array<{ path: string, message: string }> }>(`/publish/validate`, payload)
}

export async function publishWechat(payload: PublishPayload) {
  return post<{ recordId: string, status: string, draftId?: string, publishTime?: string }>(`/publish/wechat`, payload)
}

export async function getChannelCapabilities() {
  return get<{ list: Array<{ channelType: string, enabled: boolean, actions: string[], note?: string }> }>(`/channels/capabilities`)
}
