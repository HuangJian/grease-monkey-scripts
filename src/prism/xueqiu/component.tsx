import { useLayoutEffect, useRef, useState, useEffect, useReducer } from 'preact/hooks'
import { ItemActions } from '../card/primitives'
import type { DateFilter } from '../date-filter'
import { applyDateFilter } from '../shared-utils'
import { isEditableTarget } from '../shortcut'
import type { SourceComponentProps } from '../types'
import type { XueqiuState } from './state'
import type { XueqiuRenderData, XueqiuNewsItem, ViewMode } from './types'
import { SummaryView } from './ai/summary-view'
import { loadAiConfig, ensureApiKey } from './ai/config'
import { loadSummaries, saveSummary, summarize, buildSummaryEntry } from './ai/summarize'
import type { SummaryEntry, XueqiuAiConfig } from './types'

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
  return `${month}-${day}`
}

/**
 * Normalize image containers and pack adjacent images onto the same row.
 *
 * 1. Convert <p> wrapping only a single <img> into <figure class="xq-figure">
 *    so both figure-wrapped and p-wrapped images share the same CSS/layout.
 * 2. Remove whitespace between adjacent </figure> and <figure>. Without this,
 *    pre-wrap renders the newlines/indentation between figures as line breaks,
 *    forcing each figure onto its own row.
 */
export function packImages(html: string): string {
  const normalized = html.replace(
    /<p[^>]*>\s*(<img\b[^>]*>)\s*<\/p>/gi,
    '<figure class="xq-figure">$1</figure>',
  )
  return normalized.replace(/(<\/figure>)\s+(?=<figure)/gi, '$1')
}

function getTargetUrl(item: XueqiuNewsItem): string {
  if (item.target.startsWith('http')) return item.target
  return `https://xueqiu.com${item.target}`
}

export type XueqiuComponentProps = SourceComponentProps<XueqiuRenderData> & {
  state: XueqiuState
  mode: 'news' | 'hot'
  dateFilter: DateFilter
  filterUnread: boolean
  viewMode?: ViewMode
  retentionMs?: number
  onViewModeChange?: (mode: ViewMode) => void
}

export function XueqiuComponent({
  data,
  runtime,
  root,
  state,
  mode,
  dateFilter,
  filterUnread,
  viewMode = 'list',
  retentionMs = 7 * 24 * 60 * 60 * 1000,
  onViewModeChange,
  onNotify: notify,
}: XueqiuComponentProps) {
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)
  const scrollTargetRef = useRef<string | null>(null)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  // Refs for document-level Enter handler (avoids stale closures)
  const collapseExpandedRef = useRef<(() => void) | null>(null)
  const lightboxOpenRef = useRef(false)
  lightboxOpenRef.current = !!lightboxSrc

  // AI summary state
  const [summaries, setSummaries] = useState<SummaryEntry[]>([])
  const [activeSummaryId, setActiveSummaryId] = useState<string | null>(null)
  const [aiConfig, setAiConfig] = useState<XueqiuAiConfig | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [isBrowsingHistory, setIsBrowsingHistory] = useState(true)
  const aiInitRef = useRef(false)
  const genStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useLayoutEffect(() => {
    const id = scrollTargetRef.current
    if (!id) return
    scrollTargetRef.current = null
    const el = root.querySelector(`li[data-item-id="${CSS.escape(id)}"] .gm-sp-expandable-row`)
    el?.scrollIntoView({ block: 'start', behavior: 'auto' })
  })

  const news = data?.news ?? []
  const hotPosts = data?.hotPosts ?? []
  const rawItems = mode === 'news' ? news : hotPosts
  const dateFiltered = applyDateFilter(rawItems, dateFilter, (it) => it.created_at)
  const items = filterUnread
    ? dateFiltered.filter((it) => {
        const id = String(it.id)
        return !state.isRead(id) || state.isExpanded(id)
      })
    : dateFiltered

  // Build newsMap from all date-filtered items (not just unread)
  const newsMap = new Map<number, XueqiuNewsItem>()
  for (const item of dateFiltered) newsMap.set(item.id, item)

  // Items sent to LLM: optionally filter to unread only
  const summaryItems = filterUnread
    ? dateFiltered.filter((it) => !state.isRead(String(it.id)))
    : dateFiltered

  const activeSummary = activeSummaryId
    ? (summaries.find((s) => s.id === activeSummaryId) ?? null)
    : null

  // Initialize AI summary state when switching to summary view (no auto-generate)
  useLayoutEffect(() => {
    if (viewMode !== 'summary' || mode !== 'news') {
      aiInitRef.current = false
      return
    }
    if (aiInitRef.current) return
    aiInitRef.current = true
    void initAiSummary()
  }, [viewMode, mode])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  // Lightbox: Escape closes, only when open.
  // Listen on document (not ShadowRoot) because keyboard events may not
  // reach ShadowRoot when focus is outside the Shadow DOM (e.g. on body).
  useEffect(() => {
    if (!lightboxSrc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setLightboxSrc(null)
      }
    }
    runtime.document.addEventListener('keydown', onKey, { capture: true })
    return () => runtime.document.removeEventListener('keydown', onKey, { capture: true })
  }, [lightboxSrc, runtime.document])

  // Document-level Enter handler: collapse expanded item.
  // Listen on document (not ShadowRoot) because keyboard events may not
  // reach ShadowRoot when focus is outside Shadow DOM (e.g. on body).
  // Use composedPath() to get the real target inside Shadow DOM.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      // composedPath gives the real target inside Shadow DOM
      const realTarget = e.composedPath()[0] as HTMLElement
      // Only proceed if target is an Element (skip Document, Window, etc.)
      if (typeof realTarget?.closest !== 'function') return
      if (isEditableTarget(realTarget)) return
      if (realTarget.closest('a, button, .gm-sp-lightbox')) return
      if (lightboxOpenRef.current) return
      if (!collapseExpandedRef.current) return
      e.preventDefault()
      e.stopPropagation()
      collapseExpandedRef.current()
    }
    runtime.document.addEventListener('keydown', onKey, { capture: true })
    return () => runtime.document.removeEventListener('keydown', onKey, { capture: true })
  }, [runtime.document])

  async function initAiSummary() {
    const config = await loadAiConfig(runtime)
    setAiConfig(config)

    if (!config?.apiKey) {
      setAiError(null)
      return
    }

    // Load history for the dropdown — no cache-hit matching
    const all = await loadSummaries(runtime, retentionMs)
    setSummaries(all)
    setIsBrowsingHistory(true)
  }

  function startTimer() {
    genStartRef.current = Date.now()
    setElapsedSec(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - genStartRef.current) / 1000))
    }, 1000)
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  async function generateSummary(config: XueqiuAiConfig) {
    startTimer()
    setAiLoading(true)
    setAiError(null)
    try {
      const result = await summarize(runtime, summaryItems, config)
      const entry = buildSummaryEntry(result)
      await saveSummary(runtime, entry)
      const all = await loadSummaries(runtime, retentionMs)
      setSummaries(all)
      setActiveSummaryId(entry.id)
      setIsBrowsingHistory(false)
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e))
    } finally {
      stopTimer()
      setAiLoading(false)
    }
  }

  function handleRefresh() {
    if (!aiConfig?.apiKey) {
      void handleConfigure()
      return
    }
    void generateSummary(aiConfig)
  }

  async function handleConfigure() {
    const config = await ensureApiKey(runtime, aiConfig)
    setAiConfig(config)
    if (config?.apiKey) {
      await generateSummary(config)
    }
  }

  function handleTopicRead(itemIds: number[]) {
    const now = Date.now()
    for (const id of itemIds) {
      state.markRead(String(id), now)
    }
    void state.saveToStorage(runtime)
    notify?.()
    forceRender()
  }

  function handleSummaryRead() {
    if (!activeSummary) return
    const allIds = new Set<number>()
    for (const t of activeSummary.topics) for (const id of t.items) allIds.add(id)
    handleTopicRead([...allIds])
  }

  function handleBulkReadAll() {
    const now = Date.now()
    dateFiltered.forEach((it) => {
      const id = String(it.id)
      if (!state.isRead(id)) state.markRead(id, now)
    })
    void state.saveToStorage(runtime)
    notify?.()
    forceRender()
  }

  function handleItemClick(item: XueqiuNewsItem) {
    const id = String(item.id)
    state.markRead(id)
    items
      .filter((other) => other.id !== item.id)
      .forEach((other) => {
        state.setExpanded(String(other.id), false)
      })
    state.toggleExpanded(id)
    // Scroll the item into view on both expand and collapse:
    // - Expand: align top so the body is visible
    // - Collapse: re-align top so the row stays visible after content shrinks
    scrollTargetRef.current = id
    void state.saveToStorage(runtime)
    notify?.()
    forceRender()
  }

  // Keep the collapse callback ref in sync so the document-level
  // Enter handler always calls the latest handleItemClick.
  const expandedItem = items.find((it) => state.isExpanded(String(it.id)))
  collapseExpandedRef.current = expandedItem ? () => handleItemClick(expandedItem) : null

  function handleHide(id: string) {
    state.markHidden(id)
    void state.saveToStorage(runtime)
    void state.removeFromCache(runtime, id)
    forceRender()
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
    forceRender()
  }

  function renderItem(item: XueqiuNewsItem) {
    const id = String(item.id)
    const read = state.isRead(id)
    const expanded = state.isExpanded(id)
    const readClass = read ? ' gm-sp-item-read' : ''
    const expandedClass = expanded ? ' gm-sp-list-item-expanded' : ''
    const title = item.title || item.description || item.text
    return (
      <li
        key={id}
        class={`gm-sp-list-item${readClass}${expandedClass}`}
        data-item-id={escapeAttr(id)}
      >
        <span
          class="gm-sp-expandable-row"
          role="button"
          tabindex={0}
          onClick={() => handleItemClick(item)}
        >
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
        <ItemActions onBulkRead={() => handleBulkRead(item)} onHide={() => handleHide(id)} />
        {expanded && (
          <div class="gm-sp-expandable-body">
            <div
              class="gm-sp-xueqiu-body-text"
              dangerouslySetInnerHTML={{
                __html: packImages(sanitizeHtml(unescapeHtml(item.text))),
              }}
              onClick={(e) => {
                const target = e.target as HTMLElement
                if (target.tagName === 'IMG') {
                  e.stopPropagation()
                  setLightboxSrc((target as HTMLImageElement).src)
                }
              }}
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

  // AI summary view
  if (viewMode === 'summary' && mode === 'news') {
    return (
      <div class="gm-sp-xueqiu">
        <SummaryView
          summaries={summaries}
          activeSummaryId={activeSummaryId}
          newsMap={newsMap}
          loading={aiLoading}
          error={aiError}
          unconfigured={!aiConfig?.apiKey && !aiLoading}
          isRead={(id) => state.isRead(id)}
          onSelectSummary={(id) => {
            setActiveSummaryId(id || null)
            setIsBrowsingHistory(true)
          }}
          onRefresh={handleRefresh}
          onTopicRead={handleTopicRead}
          onSummaryRead={handleSummaryRead}
          onBulkRead={handleBulkReadAll}
          onConfigure={handleConfigure}
          onBack={() => onViewModeChange?.('list')}
          newsCount={summaryItems.length}
          elapsedSec={elapsedSec}
          isBrowsingHistory={isBrowsingHistory}
        />
      </div>
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
      {lightboxSrc && (
        <div class="gm-sp-lightbox" onClick={() => setLightboxSrc(null)}>
          <img class="gm-sp-lightbox-img" src={escapeAttr(lightboxSrc)} alt="" />
        </div>
      )}
    </div>
  )
}
