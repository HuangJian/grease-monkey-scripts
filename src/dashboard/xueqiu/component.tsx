import { useLayoutEffect, useRef, useState, useEffect } from 'preact/hooks'
import { ItemActions } from '../card/primitives'
import type { DateFilter } from '../date-filter'
import { applyDateFilter } from '../shared-utils'
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
  viewMode?: ViewMode
  retentionMs?: number
  onViewModeChange?: (mode: ViewMode) => void
}

export function XueqiuComponent({
  data,
  runtime,
  state,
  mode,
  dateFilter,
  viewMode = 'list',
  retentionMs = 7 * 24 * 60 * 60 * 1000,
  onViewModeChange,
  onNotify: notify,
}: XueqiuComponentProps) {
  const [, forceUpdate] = useState(0)
  const scrollTargetRef = useRef<string | null>(null)

  // AI summary state
  const [summaries, setSummaries] = useState<SummaryEntry[]>([])
  const [activeSummaryId, setActiveSummaryId] = useState<string | null>(null)
  const [aiConfig, setAiConfig] = useState<XueqiuAiConfig | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [filterUnread, setFilterUnread] = useState(true)
  const aiInitRef = useRef(false)
  const genStartRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Build newsMap from all date-filtered items (not just unread)
  const newsMap = new Map<number, XueqiuNewsItem>()
  for (const item of dateFiltered) newsMap.set(item.id, item)

  // When no active summary exists (unconfigured / error / empty), force filter off
  // so newsCount shows the full set and the checkbox appears unchecked.
  const activeSummary = summaries.find((s) => s.id === activeSummaryId) ?? null
  const effectiveFilterUnread = activeSummary ? filterUnread : false

  // Items sent to LLM: optionally filter to unread only
  const summaryItems = effectiveFilterUnread
    ? dateFiltered.filter((it) => !state.isRead(String(it.id)))
    : dateFiltered

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
    forceUpdate((n) => n + 1)
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
    forceUpdate((n) => n + 1)
  }

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
        <ItemActions onBulkRead={() => handleBulkRead(item)} onHide={() => handleHide(id)} />
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
          onSelectSummary={setActiveSummaryId}
          onRefresh={handleRefresh}
          onTopicRead={handleTopicRead}
          onSummaryRead={handleSummaryRead}
          onBulkRead={handleBulkReadAll}
          onConfigure={handleConfigure}
          onBack={() => onViewModeChange?.('list')}
          newsCount={summaryItems.length}
          elapsedSec={elapsedSec}
          filterUnread={effectiveFilterUnread}
          onToggleFilterUnread={() => setFilterUnread((v) => !v)}
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
    </div>
  )
}
