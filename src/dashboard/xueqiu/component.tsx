import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { ItemActions } from '../card/primitives'
import type { DateFilter } from '../date-filter'
import { applyDateFilter } from '../shared-utils'
import type { SourceComponentProps } from '../types'
import type { XueqiuState } from './state'
import type { XueqiuRenderData, XueqiuNewsItem } from './types'

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
    const el = runtime.document.querySelector(
      `li[data-item-id="${CSS.escape(id)}"] .gm-sp-expandable-row`,
    )
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })

  const news = data?.news ?? []
  const hotPosts = data?.hotPosts ?? []
  const rawItems = mode === 'news' ? news : hotPosts
  const dateFiltered = applyDateFilter(rawItems, dateFilter, (it) => it.created_at)
  const items =
    dateFilter === '未'
      ? dateFiltered.filter((it) => {
          const id = String(it.id)
          return !state.isRead(id) || state.isExpanded(id)
        })
      : dateFiltered

  function handleItemClick(item: XueqiuNewsItem) {
    const id = String(item.id)
    const wasExpanded = state.isExpanded(id)
    state.markRead(id)
    items
      .filter((other) => other.id !== item.id)
      .forEach((other) => {
        state.setExpanded(String(other.id), false)
      })
    state.toggleExpanded(id)
    if (!wasExpanded) {
      scrollTargetRef.current = id
    }
    void state.saveToStorage(runtime)
    notify?.()
    forceUpdate((n) => n + 1)
  }

  function handleHide(id: string) {
    state.markHidden(id)
    void state.saveToStorage(runtime)
    void state.removeFromCache(runtime, id)
    forceUpdate((n) => n + 1)
  }

  function handleBulkRead(hoveredItem: XueqiuNewsItem) {
    const hoveredId = String(hoveredItem.id)
    const idx = items.findIndex((it) => String(it.id) === hoveredId)
    if (idx < 0) return
    const now = Date.now()
    items.slice(0, idx + 1).forEach((it) => {
      const id = String(it.id)
      if (!state.isRead(id)) {
        state.markRead(id, now)
      }
    })
    void state.saveToStorage(runtime)
    forceUpdate((n) => n + 1)
  }

  function handleBulkHide(hoveredItem: XueqiuNewsItem) {
    const hoveredId = String(hoveredItem.id)
    const idx = items.findIndex((it) => String(it.id) === hoveredId)
    if (idx < 0) return
    items.slice(0, idx + 1).forEach((it) => {
      const id = String(it.id)
      state.markHidden(id)
      void state.removeFromCache(runtime, id)
    })
    void state.saveToStorage(runtime)
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
        <span class="gm-sp-expandable-row" onClick={() => handleItemClick(item)}>
          <span class="gm-sp-expandable-time">{escapeText(formatTime(item.created_at))}</span>
          <span
            class="gm-sp-expandable-title"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(unescapeHtml(title)) }}
          />
          {mode === 'hot' && (
            <span class="gm-sp-xueqiu-stats">
              <span title="回复数">💬{item.reply_count}</span>
              <span title="点赞数">👍{item.like_count}</span>
            </span>
          )}
        </span>
        <ItemActions
          onHide={() => handleHide(id)}
          onBulkRead={() => handleBulkRead(item)}
          onBulkHide={() => handleBulkHide(item)}
        />
        {expanded && (
          <div class="gm-sp-expandable-body">
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
