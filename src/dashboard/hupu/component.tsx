import { useState } from 'preact/hooks'
import type { AuthorTagMap } from '../../shared/author-labels'
import { authorClass, buildAuthorTagHtml, getTotalScore } from '../../shared/author-labels'
import { escapeHtml, escapeUrl } from '../../utils'
import type { SourceComponentProps } from '../types'
import type { ExpandCollapse } from './expand-collapse'
import { COLLAPSE_THRESHOLD } from './expand-collapse'
import type { HupuState } from './state'
import type { HupuRenderData } from './source'

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

export function applyHupuDateFilter(
  data: HupuRenderData | null,
  filter: DateFilter,
): HupuRenderData | null {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds || !data) return data
  const result: HupuRenderData = {}
  for (const [board, posts] of Object.entries(data)) {
    const filtered = posts.filter((t) => {
      if (t.created === undefined) return false
      if (bounds.start !== undefined && t.created < bounds.start) return false
      if (bounds.end !== undefined && t.created >= bounds.end) return false
      return true
    })
    if (filtered.length > 0) result[board] = filtered
  }
  return result
}

function formatReplyCount(current: number, readReplies: number | undefined): string {
  if (readReplies === undefined) return `${current}`
  if (current <= readReplies) return `${current}`
  return `${readReplies}+${current - readReplies}`
}

function sourceBadge(created: number): { icon: string; title: string } {
  const now = Date.now()
  const isToday = new Date(created).toDateString() === new Date(now).toDateString()
  return isToday ? { icon: '🌅', title: '今日主题' } : { icon: '⏳', title: '历史主题' }
}

export type HupuDateFilterProps = {
  dateFilter: DateFilter
  onChange: (filter: DateFilter) => void
}

export function HupuDateFilter({ dateFilter, onChange }: HupuDateFilterProps) {
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
    </div>
  )
}

export type HupuComponentProps = SourceComponentProps<HupuRenderData> & {
  state: HupuState
  expandCollapse: ExpandCollapse
  authorTagMap: AuthorTagMap
  dateFilter: DateFilter
}

export function HupuComponent({
  data,
  runtime,
  state,
  expandCollapse,
  authorTagMap,
  dateFilter,
}: HupuComponentProps) {
  const [, forceUpdate] = useState(0)

  const dateFiltered = applyHupuDateFilter(data, dateFilter)
  const filtered: HupuRenderData | null =
    dateFilter === '未' && dateFiltered
      ? Object.entries(dateFiltered).reduce<HupuRenderData>((acc, [board, posts]) => {
          const unread = posts.filter((p) => !state.isRead(p.id))
          if (unread.length > 0) acc[board] = unread
          return acc
        }, {})
      : dateFiltered

  if (!filtered || Object.keys(filtered).length === 0) {
    return <div class="gm-sp-empty">暂无数据</div>
  }

  const allBoards = Object.keys(filtered)
  let totalPosts = 0
  for (const posts of Object.values(filtered)) totalPosts += posts.length
  const showCaret = totalPosts > COLLAPSE_THRESHOLD
  const active = expandCollapse.activeBoards(allBoards, totalPosts)

  function handleMarkRead(postId: string, replies: number) {
    state.markRead(postId, Date.now(), replies)
    if (runtime) void state.saveToStorage(runtime)
    forceUpdate((n) => n + 1)
  }

  function handleHide(postId: string) {
    state.markHidden(postId)
    if (runtime) {
      void state.saveToStorage(runtime)
      void state.removeFromCache(runtime, postId)
      void state.removeFromHistory(runtime, postId)
    }
    forceUpdate((n) => n + 1)
  }

  function handleMarkAllRead(board: string) {
    const now = Date.now()
    const posts = filtered![board] ?? []
    for (const post of posts) {
      if (!state.isRead(post.id)) {
        state.markRead(post.id, now, post.replies)
      }
    }
    if (runtime) void state.saveToStorage(runtime)
    forceUpdate((n) => n + 1)
  }

  function handleToggleBoard(board: string) {
    expandCollapse.toggleBoard(board, totalPosts)
    forceUpdate((n) => n + 1)
  }

  return (
    <div class="gm-sp-reddit">
      {allBoards.map((board) => {
        const visiblePosts = state.filterVisible(filtered[board] ?? [])
        if (visiblePosts.length === 0) return null
        const isActive = active.has(board)
        const collapsedClass = isActive ? '' : ' gm-sp-reddit-section-collapsed'
        const caretClass = showCaret ? ' gm-sp-reddit-caret-visible' : ''
        return (
          <section class={`gm-sp-reddit-section${collapsedClass}`} data-board={escapeHtml(board)}>
            <h3
              class="gm-sp-reddit-sub-title"
              data-board={escapeHtml(board)}
              onClick={() => handleToggleBoard(board)}
            >
              <span class={`gm-sp-reddit-caret${caretClass}`}>▾</span>
              {escapeHtml(board)}
              <button
                type="button"
                class="gm-sp-date-filter-btn gm-sp-archive-btn"
                title="归档：标记该版块所有主题为已读"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMarkAllRead(board)
                }}
              >
                🧹
              </button>
            </h3>
            <ol class="gm-sp-list">
              {visiblePosts.map((post) => {
                const badge = sourceBadge(post.created)
                const author = post.author
                const authorTags = author ? authorTagMap[author] : undefined
                const ac = authorClass(authorTags ? getTotalScore(authorTags) : 0)
                const titleSuffix = buildAuthorTagHtml(authorTags, escapeHtml)
                const authorText = author ? `@${escapeHtml(author)}` : ''
                const replyCount = formatReplyCount(post.replies, state.getReadReplies(post.id))
                return (
                  <li
                    class={`gm-sp-list-item gm-sp-list-item-flex${state.isRead(post.id) ? ' gm-sp-item-read' : ''}`}
                    data-post-id={post.id}
                  >
                    <span class="gm-sp-reddit-source" title={badge.title}>
                      {badge.icon}
                    </span>
                    <span class="gm-sp-item-count" title="回复数">
                      {replyCount}
                    </span>
                    <a
                      class="gm-sp-item-title"
                      href={escapeUrl(post.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleMarkRead(post.id, post.replies)}
                      dangerouslySetInnerHTML={{ __html: escapeHtml(post.title) + titleSuffix }}
                    />
                    <span class="gm-sp-reddit-score" title="亮了">
                      {post.lights}
                    </span>
                    <span class={`gm-sp-reddit-author${ac}`}>{authorText}</span>
                    <button
                      class="gm-sp-item-hide"
                      title="隐藏该主题"
                      onClick={() => handleHide(post.id)}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        )
      })}
    </div>
  )
}
