import { useState } from 'preact/hooks'
import type { AuthorTagMap } from '../../shared/author-labels'
import { authorClass, buildAuthorTagHtml, getTotalScore } from '../../shared/author-labels'
import { escapeHtml, escapeUrl } from '../../utils'
import type { SourceComponentProps } from '../types'
import type { V2exState } from './state'
import type { V2exTopic } from './types'

const DATE_OPTIONS = ['全部', '今天', '昨天', '前天'] as const
type DateFilter = (typeof DATE_OPTIONS)[number]

function dateFilterBounds(filter: DateFilter, now: number): { start: number; end?: number } | null {
  if (filter === '全部') return null
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const ts = todayStart.getTime()
  switch (filter) {
    case '今天':
      return { start: ts }
    case '昨天':
      return { start: ts - 86400000, end: ts }
    case '前天':
      return { start: ts - 172800000, end: ts - 86400000 }
    default:
      return null
  }
}

function applyDateFilter(data: V2exTopic[] | null, filter: DateFilter): V2exTopic[] | null {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds || !data) return data
  return data.filter((t) => {
    if (t.created === undefined) return false
    if (t.created < bounds.start) return false
    if (bounds.end !== undefined && t.created >= bounds.end) return false
    return true
  })
}

function formatReplyCount(current: number, readReplies: number | undefined): string {
  if (readReplies === undefined) return `${current}`
  if (current <= readReplies) return `${current}`
  return `${readReplies}+${current - readReplies}`
}

const SOURCE_BADGES = {
  cross: { icon: '🔥', title: '双源确认热帖' },
  page: { icon: '🌅', title: '今天发布的热帖' },
  api: { icon: '⏳', title: 'API 抓取或历史热帖' },
} as const

function sourceBadge(topic: V2exTopic): { icon: string; title: string } | null {
  const sources = topic.sources
  const isFromApi = sources?.includes('api') ?? false
  const isFromPage = sources?.includes('page') ?? false
  if (isFromApi && isFromPage) return SOURCE_BADGES.cross
  if (isFromPage) return SOURCE_BADGES.page
  if (isFromApi) return SOURCE_BADGES.api
  return null
}

export type V2exDateFilterProps = {
  dateFilter: DateFilter
  onChange: (filter: DateFilter) => void
}

export function V2exDateFilter({ dateFilter, onChange }: V2exDateFilterProps) {
  return (
    <div class="gm-sp-date-filter">
      <select
        class="gm-sp-date-filter-select"
        value={dateFilter}
        onChange={(e) => onChange((e.target as HTMLSelectElement).value as DateFilter)}
      >
        {DATE_OPTIONS.map((opt) => (
          <option value={opt} selected={opt === dateFilter}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  )
}

export type V2exComponentProps = SourceComponentProps<V2exTopic[]> & {
  state: V2exState
  authorTagMap: AuthorTagMap
  dateFilter: DateFilter
}

export function V2exComponent({
  data,
  runtime,
  state,
  authorTagMap,
  dateFilter,
}: V2exComponentProps) {
  const [, forceUpdate] = useState(0)

  const visible = data ? state.filterVisible(applyDateFilter(data, dateFilter) ?? []) : null

  function handleMarkRead(topic: V2exTopic) {
    state.markRead(topic.id, Date.now(), topic.replies)
    if (runtime) void state.saveToStorage(runtime)
    forceUpdate((n) => n + 1)
  }

  function handleHide(topic: V2exTopic) {
    state.markHidden(topic.id)
    if (runtime) {
      void state.saveToStorage(runtime)
      void state.removeFromCache(runtime, topic.id)
    }
    forceUpdate((n) => n + 1)
  }

  if (!visible || visible.length === 0) {
    return (
      <div class="gm-sp-v2ex">
        <div class="gm-sp-empty">暂无数据</div>
      </div>
    )
  }

  return (
    <div class="gm-sp-v2ex">
      <ol class="gm-sp-list">
        {visible.map((topic) => {
          const badge = sourceBadge(topic)
          const username = topic.member.username
          const authorTags = username ? authorTagMap[username] : undefined
          const ac = authorClass(authorTags ? getTotalScore(authorTags) : 0)
          const titleSuffix = buildAuthorTagHtml(authorTags, escapeHtml)
          const replyCount = formatReplyCount(topic.replies, state.getReadReplies(topic.id))
          return (
            <li
              class={`gm-sp-list-item gm-sp-list-item-flex${state.isRead(topic.id) ? ' gm-sp-item-read' : ''}`}
              data-topic-id={topic.id}
            >
              <span class="gm-sp-v2ex-source" title={badge?.title}>
                {badge?.icon ?? ''}
              </span>
              <span class="gm-sp-item-count" title="回复数">
                {replyCount}
              </span>
              <a
                class="gm-sp-item-title"
                href={escapeUrl(topic.url)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => handleMarkRead(topic)}
                dangerouslySetInnerHTML={{ __html: escapeHtml(topic.title) + titleSuffix }}
              />
              <span class="gm-sp-item-meta">
                <span>{escapeHtml(topic.node.title)}</span>
                <span class={ac.trim() || undefined}>@{escapeHtml(username)}</span>
              </span>
              <button class="gm-sp-item-hide" title="隐藏该主题" onClick={() => handleHide(topic)}>
                ×
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
