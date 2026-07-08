import { useState } from 'preact/hooks'
import type { SummaryEntry, SummaryTopic, XueqiuNewsItem } from '../types'
import { stripHtml } from './prompt'
import { useExpandScroll } from '../../shared/expandable-list'
import { formatTopicTime } from '../../shared/expandable-utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTargetUrl(item: XueqiuNewsItem): string {
  if (item.target.startsWith('http')) return item.target
  return `https://xueqiu.com${item.target}`
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function indexToLetter(idx: number): string {
  if (idx < 26) return LETTERS[idx]!
  return LETTERS[idx % 26]! + String(idx + 1)
}

const IMPORTANCE_EMOJI: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
}

const IMPORTANCE_CLASS: Record<string, string> = {
  high: 'gm-sp-ai-importance-high',
  medium: 'gm-sp-ai-importance-medium',
  low: 'gm-sp-ai-importance-low',
}

const IMPORTANCE_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

/** Compute average elapsed seconds from past summaries that have timing data. */
function avgElapsedSec(summaries: SummaryEntry[]): number | null {
  const timed = summaries.filter((s) => s.elapsedMs > 0)
  if (timed.length === 0) return null
  const total = timed.reduce((sum, s) => sum + s.elapsedMs, 0)
  return Math.round(total / timed.length / 1000)
}

// ---------------------------------------------------------------------------
// Topic card
// ---------------------------------------------------------------------------

type TopicCardProps = {
  topicKey: string
  topic: SummaryTopic
  newsMap: Map<number, XueqiuNewsItem>
  isRead: (id: string) => boolean
  collapsed: boolean
  onToggleCollapse: () => void
  onTopicRead: () => void
}

function TopicCard({
  topicKey,
  topic,
  newsMap,
  isRead,
  collapsed,
  onToggleCollapse,
  onTopicRead,
}: TopicCardProps) {
  const [hoveredRef, setHoveredRef] = useState<{
    item: XueqiuNewsItem
    left: number
    top: number
  } | null>(null)
  const refs = topic.items
    .map((id) => newsMap.get(id))
    .filter((it): it is XueqiuNewsItem => it !== undefined)
    .sort((a, b) => a.created_at - b.created_at)

  // Latest item timestamp = topic publish time
  const latestTs = refs.length > 0 ? refs[refs.length - 1]!.created_at : undefined

  return (
    <div
      class={`gm-sp-ai-card ${IMPORTANCE_CLASS[topic.importance] ?? ''}`}
      data-topic-key={topicKey}
    >
      <div class="gm-sp-ai-card-header" onClick={onToggleCollapse}>
        <span class="gm-sp-ai-importance">{IMPORTANCE_EMOJI[topic.importance] ?? '⚪'}</span>
        <span class="gm-sp-ai-category">{topic.category}</span>
        {latestTs !== undefined && (
          <span class="gm-sp-expandable-time">{formatTopicTime(latestTs, 'date-time')}</span>
        )}
        <span class="gm-sp-ai-title">{topic.title}</span>
        <button
          type="button"
          class="gm-sp-ai-topic-read-btn"
          title="标记本主题新闻为已读"
          onClick={(e) => {
            e.stopPropagation()
            onTopicRead()
          }}
        >
          本主题已读
        </button>
        <span class="gm-sp-ai-collapse">{collapsed ? '▸' : '▾'}</span>
      </div>
      {!collapsed && (
        <div class="gm-sp-ai-card-body">
          <p class="gm-sp-ai-summary-text">{topic.summary}</p>
          {refs.length > 0 && (
            <div class="gm-sp-ai-refs" onMouseLeave={() => setHoveredRef(null)}>
              {refs.map((item, idx) => {
                const read = isRead(String(item.id))
                return (
                  <a
                    key={item.id}
                    class={`gm-sp-ai-ref${read ? ' gm-sp-ai-ref-read' : ''}`}
                    href={getTargetUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onMouseEnter={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      setHoveredRef({ item, left: rect.left, top: rect.top })
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {indexToLetter(idx)}
                  </a>
                )
              })}
            </div>
          )}
          {hoveredRef && (
            <div
              class="gm-sp-ai-ref-tooltip"
              style={{ left: `${hoveredRef.left}px`, top: `${hoveredRef.top - 6}px` }}
            >
              {stripHtml(hoveredRef.item.text)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// SummaryView
// ---------------------------------------------------------------------------

const TOPIC_SELECTOR = (id: string): string =>
  `[data-topic-key="${CSS.escape(id)}"] .gm-sp-ai-card-header`

export type SummaryViewProps = {
  summaries: SummaryEntry[]
  activeSummaryId: string | null
  newsMap: Map<number, XueqiuNewsItem>
  root: ShadowRoot | HTMLElement
  loading: boolean
  error: string | null
  unconfigured: boolean
  isRead: (id: string) => boolean
  onSelectSummary: (id: string) => void
  onRefresh: () => void
  onTopicRead: (itemIds: number[]) => void
  onSummaryRead: () => void
  onBulkRead: () => void
  onConfigure: () => void
  onBack: () => void
  newsCount: number
  elapsedSec: number
  isBrowsingHistory: boolean
}

export function SummaryView({
  summaries,
  activeSummaryId,
  newsMap,
  root,
  loading,
  error,
  unconfigured,
  isRead,
  onSelectSummary,
  onRefresh,
  onTopicRead,
  onSummaryRead,
  onBulkRead,
  onConfigure,
  onBack,
  newsCount,
  elapsedSec,
  isBrowsingHistory,
}: SummaryViewProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const { scrollIfNeeded } = useExpandScroll(root, TOPIC_SELECTOR)

  // Don't auto-select the most recent summary — null means "browse mode"
  const active = activeSummaryId ? (summaries.find((s) => s.id === activeSummaryId) ?? null) : null

  // Timing stats for display
  const avgSec = avgElapsedSec(summaries)
  const lastTimed = summaries.find((s) => s.elapsedMs > 0) ?? null

  function toggleCollapse(key: string) {
    scrollIfNeeded(key)
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Build dynamic loading message
  function loadingMessage(): string {
    const parts = [`正在为 ${newsCount} 条新闻生成摘要，已耗时 ${elapsedSec}s`]
    if (avgSec !== null) parts.push(`平均 ${avgSec}s`)
    if (lastTimed) {
      parts.push(`上次 ${Math.round(lastTimed.elapsedMs / 1000)}s/${lastTimed.itemCount}条`)
    }
    return parts.join('，')
  }

  // Unconfigured state
  if (unconfigured) {
    return (
      <div class="gm-sp-ai-summary">
        <div class="gm-sp-empty gm-sp-ai-status">
          <p>💡 AI 摘要未配置</p>
          <p class="gm-sp-ai-status-hint">点击配置 API Key</p>
          <div class="gm-sp-ai-status-actions">
            <button type="button" class="gm-sp-btn gm-sp-btn-icon" onClick={onConfigure}>
              配置
            </button>
            <button type="button" class="gm-sp-btn gm-sp-btn-icon" onClick={onBack}>
              回到列表
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Loading state (no summary to show)
  if (loading && !active) {
    return (
      <div class="gm-sp-ai-summary">
        <div class="gm-sp-empty gm-sp-ai-status">
          <p>⏳ {loadingMessage()}</p>
          <p class="gm-sp-ai-status-hint">大上下文模型可能需要 1-6 分钟</p>
          <div class="gm-sp-ai-status-actions">
            <button type="button" class="gm-sp-btn gm-sp-btn-icon" onClick={onBack}>
              取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Error state (no summary to show)
  if (error && !active) {
    return (
      <div class="gm-sp-ai-summary">
        <div class="gm-sp-error-box gm-sp-ai-status">
          <p>❌ 摘要生成失败</p>
          <p class="gm-sp-ai-status-hint">{error}</p>
          <div class="gm-sp-ai-status-actions">
            <button type="button" class="gm-sp-btn gm-sp-btn-icon" onClick={onRefresh}>
              重试
            </button>
            <button type="button" class="gm-sp-btn gm-sp-btn-icon" onClick={onBack}>
              回到列表
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Hide bulk-read / filter-unread / generate ONLY when reading a past summary
  // (isBrowsingHistory && active). In browse mode (no selection) and freshly-
  // generated mode, all controls are visible.
  const showBulkRead = !!active && !isBrowsingHistory
  const showGenerateButton = !isBrowsingHistory || !active

  return (
    <div class="gm-sp-ai-summary">
      {/* Sticky top: toolbar + loading bar */}
      <div class="gm-sp-ai-sticky-top">
        <div class="gm-sp-ai-toolbar">
          {summaries.length > 0 && (
            <select
              class="gm-sp-input gm-sp-ai-history-select"
              value={activeSummaryId ?? ''}
              onChange={(e) => onSelectSummary((e.target as HTMLSelectElement).value)}
            >
              <option value="">== 为列表视图的新闻生成摘要 → ==</option>
              {summaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {formatTopicTime(s.generatedAt, 'date-time')} · {s.topics.length}主题 ·{' '}
                  {s.newsCount}条
                </option>
              ))}
            </select>
          )}
          {active && (
            <button
              type="button"
              class="gm-sp-btn gm-sp-btn-icon"
              onClick={onSummaryRead}
              title="标记摘要中所有新闻为已读"
            >
              本摘要已读
            </button>
          )}
          {showBulkRead && (
            <button
              type="button"
              class="gm-sp-btn gm-sp-btn-icon"
              onClick={onBulkRead}
              title="标记当前列表所有新闻为已读"
            >
              本批已读
            </button>
          )}
          {showGenerateButton && (
            <button
              type="button"
              class={`gm-sp-btn gm-sp-btn-icon gm-sp-ai-refresh-btn${active ? ' gm-sp-ai-refresh-btn-done' : ''}`}
              onClick={onRefresh}
              disabled={loading}
              title="调用 LLM 生成/刷新摘要"
            >
              {loading
                ? `⏳ ${elapsedSec}s`
                : active
                  ? `重新生成摘要（${newsCount}条）`
                  : `生成摘要（${newsCount}条）`}
            </button>
          )}
        </div>

        {/* Loading overlay while refreshing with summary */}
        {loading && <div class="gm-sp-ai-loading-bar">⏳ {loadingMessage()}</div>}
      </div>

      {/* Error banner (has summary) */}
      {error && <div class="gm-sp-error-box gm-sp-ai-error-banner">上次刷新失败: {error}</div>}

      {/* Topic cards or placeholder */}
      {active ? (
        [...active.topics]
          .sort(
            (a, b) => (IMPORTANCE_ORDER[a.importance] ?? 2) - (IMPORTANCE_ORDER[b.importance] ?? 2),
          )
          .map((topic, idx) => {
            const key = `${active.id}-${idx}`
            return (
              <TopicCard
                key={key}
                topicKey={key}
                topic={topic}
                newsMap={newsMap}
                isRead={isRead}
                collapsed={collapsed.has(key)}
                onToggleCollapse={() => toggleCollapse(key)}
                onTopicRead={() => onTopicRead(topic.items)}
              />
            )
          })
      ) : (
        <div class="gm-sp-empty gm-sp-ai-status">
          <p>{summaries.length > 0 ? '选择往期摘要或生成新摘要' : '暂无 AI 摘要'}</p>
        </div>
      )}
    </div>
  )
}
