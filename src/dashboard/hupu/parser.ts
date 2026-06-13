import { htmlToDocument, toAbsoluteUrl } from '../../utils'
import { HUPU_BASE_URL } from './constants'
import type { HupuPost } from './types'

export function normalizeBoardSlug(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/bbs\.hupu\.com\//, '')
    .replace(/^\//, '')
    .replace(/\/$/, '')
}

export function buildBoardUrl(slug: string): string {
  return `${HUPU_BASE_URL}/${slug}`
}

export function parseHupuDataJson(json: unknown, board: string, maxItems: number): HupuPost[] {
  if (!json || typeof json !== 'object') return []
  const root = json as Record<string, unknown>
  const topic = root['topic'] as Record<string, unknown> | undefined
  const threads = topic?.['threads'] as Record<string, unknown> | undefined
  const list = threads?.['list']
  if (!Array.isArray(list)) return []
  const out: HupuPost[] = []
  const now = Date.now()
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const d = item as Record<string, unknown>
    const tid = typeof d['tid'] === 'string' ? d['tid'] : String(d['tid'] ?? '')
    const title = typeof d['title'] === 'string' ? d['title'] : ''
    const url = typeof d['url'] === 'string' ? d['url'] : ''
    const lights = typeof d['lights'] === 'number' ? d['lights'] : Number(d['lights'] ?? 0)
    const replies = typeof d['replies'] === 'number' ? d['replies'] : Number(d['replies'] ?? 0)
    const views = typeof d['read'] === 'number' ? d['read'] : Number(d['read'] ?? 0)
    const createdAt =
      typeof d['createdAt'] === 'number' ? d['createdAt'] : Number(d['createdAt'] ?? 0)
    const authorObj = d['author'] as Record<string, unknown> | undefined
    const author = authorObj && typeof authorObj['puname'] === 'string' ? authorObj['puname'] : ''
    const authorUrl = authorObj && typeof authorObj['url'] === 'string' ? authorObj['url'] : ''
    const topicObj = d['topic'] as Record<string, unknown> | undefined
    const topicName = topicObj && typeof topicObj['name'] === 'string' ? topicObj['name'] : ''
    if (!tid || !title) continue
    const fullUrl = url ? toAbsoluteUrl(url, HUPU_BASE_URL) || `${HUPU_BASE_URL}${url}` : ''
    out.push({
      id: tid,
      title,
      url: fullUrl,
      lights: Math.max(0, Math.floor(lights)),
      replies: Math.max(0, Math.floor(replies)),
      views: Math.max(0, Math.floor(views)),
      author,
      authorUrl,
      board,
      topicName,
      created: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now,
    })
    if (out.length >= maxItems) break
  }
  return out
}

export function parseHupuDom(
  html: string,
  board: string,
  maxItems: number,
  domParser: DOMParser,
): HupuPost[] {
  if (!html) return []
  const doc = htmlToDocument(html, domParser)
  const items = doc.querySelectorAll('.bbs-sl-web-post-body')
  const out: HupuPost[] = []
  const now = Date.now()
  for (const item of items) {
    const titleEl = item.querySelector('.post-title a.p-title')
    if (!titleEl) continue
    const href = titleEl.getAttribute('href') ?? ''
    const title = (titleEl.textContent ?? '').trim()
    if (!title || !href) continue
    const idMatch = href.match(/\/(\d+)\.html/)
    const id = idMatch ? idMatch[1] : href
    const fullUrl = toAbsoluteUrl(href, HUPU_BASE_URL) || `${HUPU_BASE_URL}${href}`
    const datumEl = item.querySelector('.post-datum')
    const datumText = (datumEl?.textContent ?? '').trim()
    const parts = datumText.split('/').map((s) => s.trim())
    const replies = parts.length >= 1 ? Number(parts[0]) : 0
    const views = parts.length >= 2 ? Number(parts[1]) : 0
    const authorEl = item.querySelector('.post-auth a')
    const author = (authorEl?.textContent ?? '').trim()
    const authorUrl = authorEl?.getAttribute('href') ?? ''
    const timeEl = item.querySelector('.post-time')
    const timeText = (timeEl?.textContent ?? '').trim()
    const created = parseRelativeTime(timeText, now)
    out.push({
      id,
      title,
      url: fullUrl,
      lights: 0,
      replies: Number.isFinite(replies) ? replies : 0,
      views: Number.isFinite(views) ? views : 0,
      author,
      authorUrl: authorUrl ? toAbsoluteUrl(authorUrl, HUPU_BASE_URL) || authorUrl : '',
      board,
      topicName: '',
      created,
    })
    if (out.length >= maxItems) break
  }
  return out
}

function parseRelativeTime(text: string, now: number): number {
  if (!text) return now
  const minuteMatch = text.match(/(\d+)\s*分钟前/)
  if (minuteMatch) return now - Number(minuteMatch[1]) * 60_000
  const hourMatch = text.match(/(\d+)\s*小时前/)
  if (hourMatch) return now - Number(hourMatch[1]) * 3_600_000
  const dayMatch = text.match(/(\d+)\s*天前/)
  if (dayMatch) return now - Number(dayMatch[1]) * 86_400_000
  const fullMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (fullMatch) {
    const [, y, m, d, h, min] = fullMatch
    const ts = new Date(`${y}-${m}-${d}T${h}:${min}:00+08:00`).getTime()
    if (Number.isFinite(ts) && ts > 0) return ts
  }
  const mdMatch = text.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/)
  if (mdMatch) {
    const [, m, d, h, min] = mdMatch
    const year = new Date().getFullYear()
    const ts = new Date(`${year}-${m}-${d}T${h}:${min}:00+08:00`).getTime()
    if (Number.isFinite(ts) && ts > 0) return ts
  }
  return now
}

export function mergeHupuPosts(jsonPosts: HupuPost[], domPosts: HupuPost[]): HupuPost[] {
  const byId = new Map<string, HupuPost>()
  for (const p of jsonPosts) {
    if (!p.id) continue
    byId.set(p.id, p)
  }
  for (const p of domPosts) {
    if (!p.id) continue
    const existing = byId.get(p.id)
    if (existing) {
      byId.set(p.id, {
        ...existing,
        lights: Math.max(existing.lights, p.lights),
        replies: Math.max(existing.replies, p.replies),
        views: Math.max(existing.views, p.views),
        author: existing.author || p.author,
        authorUrl: existing.authorUrl || p.authorUrl,
        topicName: existing.topicName || p.topicName,
      })
    } else {
      byId.set(p.id, p)
    }
  }
  return Array.from(byId.values())
}
