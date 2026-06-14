import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { SourceComponentProps } from '../types'
import type { XueqiuState } from './state'
import type { XueqiuRenderData, XueqiuNewsItem } from './types'

const DATE_OPTIONS = ['全', '今', '昨', '前', '早', '未'] as const
export type DateFilter = (typeof DATE_OPTIONS)[number]

function dateFilterBounds(
  filter: DateFilter,
  now: number,
): { start?: number; end?: number } | null {
  if (filter === '全') return null
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const ts = todayStart.getTime()
  switch (filter) {
    case '今':
      return { start: ts }
    case '昨':
      return { start: ts - 86400000, end: ts }
    case '前':
      return { start: ts - 172800000, end: ts - 86400000 }
    case '早':
      return { end: ts - 172800000 }
    default:
      return null
  }
}

export function applyDateFilter(items: XueqiuNewsItem[], filter: DateFilter): XueqiuNewsItem[] {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds) return items
  return items.filter((item) => {
    if (bounds.start !== undefined && item.created_at < bounds.start) return false
    if (bounds.end !== undefined && item.created_at >= bounds.end) return false
    return true
  })
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;lt;/g, '<')
    .replace(/&amp;gt;/g, '>')
    .replace(/&amp;quot;/g, '"')
    .replace(/&amp;#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, 'data-blocked=')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hour = String(d.getHours()).padStart(2, '0')
  const minute = String(d.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hour}:${minute}`
}

function getTargetUrl(item: XueqiuNewsItem): string {
  if (item.target.startsWith('http')) return item.target
  return `https://xueqiu.com${item.target}`
}

export type XueqiuDateFilterProps = {
  dateFilter: DateFilter
  onChange: (filter: DateFilter) => void
  onMarkAllRead?: () => void
}

export function XueqiuDateFilter({ dateFilter, onChange, onMarkAllRead }: XueqiuDateFilterProps) {
  return (
    <div class="gm-sp-date-filter">
      {DATE_OPTIONS.map((opt) => (
        <button
          type="button"
          class={`gm-sp-date-filter-btn${dateFilter === opt ? ' gm-sp-date-filter-btn-active' : ''}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
      {onMarkAllRead && (
        <button
          type="button"
          class="gm-sp-date-filter-btn gm-sp-archive-btn"
          title="全部已读"
          onClick={onMarkAllRead}
        >
          🧹
        </button>
      )}
    </div>
  )
}

export type XueqiuComponentProps = SourceComponentProps<XueqiuRenderData> & {
  state: XueqiuState
  mode: 'news' | 'hot'
  dateFilter: DateFilter
}

export function XueqiuComponent({
  data,
  runtime,
  state,
  mode,
  dateFilter,
  onNotify: notify,
}: XueqiuComponentProps) {
  const [, forceUpdate] = useState(0)
  const scrollTargetRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    const id = scrollTargetRef.current
    if (!id) return
    scrollTargetRef.current = null
    const el = document.querySelector(`li[data-item-id="${CSS.escape(id)}"] .gm-sp-xueqiu-row`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })

  const news = data?.news ?? []
  const hotPosts = data?.hotPosts ?? []
  const rawItems = mode === 'news' ? news : hotPosts
  const dateFiltered = applyDateFilter(rawItems, dateFilter)
  const items =
    dateFilter === '未' ? dateFiltered.filter((it) => !state.isRead(String(it.id))) : dateFiltered

  function handleItemClick(item: XueqiuNewsItem) {
    const id = String(item.id)
    const wasExpanded = state.isExpanded(id)
    state.markRead(id)
    for (const other of items) {
      if (other.id !== item.id) {
        state.setExpanded(String(other.id), false)
      }
    }
    state.toggleExpanded(id)
    if (!wasExpanded) {
      scrollTargetRef.current = id
    }
    if (runtime) void state.saveToStorage(runtime)
    notify?.()
    forceUpdate((n) => n + 1)
  }

  function handleHide(id: string) {
    state.markHidden(id)
    if (runtime) {
      void state.saveToStorage(runtime)
      void state.removeFromCache(runtime, id)
    }
    forceUpdate((n) => n + 1)
  }

  function renderItem(item: XueqiuNewsItem) {
    const id = String(item.id)
    const read = state.isRead(id)
    const expanded = state.isExpanded(id)
    const readClass = read ? ' gm-sp-item-read' : ''
    const expandedClass = expanded ? ' gm-sp-list-item-expanded' : ''
    const title = item.title || item.description || item.text
    return (
      <li class={`gm-sp-list-item${readClass}${expandedClass}`} data-item-id={escapeAttr(id)}>
        <span class="gm-sp-xueqiu-row" onClick={() => handleItemClick(item)}>
          <span class="gm-sp-xueqiu-time">{escapeText(formatTime(item.created_at))}</span>
          <span
            class="gm-sp-xueqiu-text"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(unescapeHtml(title)) }}
          />
          {mode === 'hot' && (
            <span class="gm-sp-xueqiu-stats">
              <span title="回复数">💬{item.reply_count}</span>
              <span title="点赞数">👍{item.like_count}</span>
            </span>
          )}
          <button
            type="button"
            class="gm-sp-item-hide"
            aria-label="hide"
            onClick={(e) => {
              e.stopPropagation()
              handleHide(id)
            }}
          >
            ×
          </button>
        </span>
        {expanded && (
          <div class="gm-sp-xueqiu-body">
            <div
              class="gm-sp-xueqiu-body-text"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(unescapeHtml(item.text)) }}
            />
            <a
              class="gm-sp-xueqiu-link"
              href={escapeAttr(getTargetUrl(item))}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              查看原文 →
            </a>
          </div>
        )}
      </li>
    )
  }

  if (items.length === 0) {
    return (
      <div class="gm-sp-xueqiu">
        <div class="gm-sp-empty">暂无数据</div>
      </div>
    )
  }

  return (
    <div class="gm-sp-xueqiu">
      <ol class="gm-sp-list">{items.map((item) => renderItem(item))}</ol>
    </div>
  )
}
