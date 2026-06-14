import { useState } from 'preact/hooks'
import type { AuthorTagMap } from '../../shared/author-labels'
import { authorClass, buildAuthorTagHtml, getTotalScore } from '../../shared/author-labels'
import { escapeHtml, escapeUrl } from '../../utils'
import type { DateFilter } from '../date-filter'
import { dateFilterBounds } from '../date-filter'
import type { SourceComponentProps } from '../types'
import type { ExpandCollapse } from './expand-collapse'
import { COLLAPSE_THRESHOLD } from './expand-collapse'
import type { RedditState } from './state'
import type { RedditRenderData } from './source'

export function applyRedditDateFilter(
  data: RedditRenderData | null,
  filter: DateFilter,
): RedditRenderData | null {
  const bounds = dateFilterBounds(filter, Date.now())
  if (!bounds || !data) return data
  const result: RedditRenderData = {}
  for (const [sub, posts] of Object.entries(data)) {
    const filtered = posts.filter((t) => {
      if (t.created === undefined) return false
      if (bounds.start !== undefined && t.created < bounds.start) return false
      if (bounds.end !== undefined && t.created >= bounds.end) return false
      return true
    })
    if (filtered.length > 0) result[sub] = filtered
  }
  return result
}

function formatCommentCount(current: number, readReplies: number | undefined): string {
  if (readReplies === undefined) return `${current}`
  if (current <= readReplies) return `${current}`
  return `${readReplies}+${current - readReplies}`
}

function sourceBadge(created: number): { icon: string; title: string } {
  const now = Date.now()
  const isToday = new Date(created).toDateString() === new Date(now).toDateString()
  return isToday ? { icon: '🌅', title: '今日主题' } : { icon: '⏳', title: '历史主题' }
}

export type RedditComponentProps = SourceComponentProps<RedditRenderData> & {
  state: RedditState
  expandCollapse: ExpandCollapse
  authorTagMap: AuthorTagMap
  dateFilter: DateFilter
}

export function RedditComponent({
  data,
  runtime,
  state,
  expandCollapse,
  authorTagMap,
  dateFilter,
}: RedditComponentProps) {
  const [, forceUpdate] = useState(0)

  const dateFiltered = applyRedditDateFilter(data, dateFilter)
  const filtered: RedditRenderData | null =
    dateFilter === '未' && dateFiltered
      ? Object.entries(dateFiltered).reduce<RedditRenderData>((acc, [sub, posts]) => {
          const unread = posts.filter((p) => !state.isRead(p.id))
          if (unread.length > 0) acc[sub] = unread
          return acc
        }, {})
      : dateFiltered

  if (!filtered || Object.keys(filtered).length === 0) {
    return <div class="gm-sp-empty">暂无数据</div>
  }

  const allSubs = Object.keys(filtered)
  let totalPosts = 0
  for (const posts of Object.values(filtered)) totalPosts += posts.length
  const showCaret = totalPosts > COLLAPSE_THRESHOLD
  const active = expandCollapse.activeSubs(allSubs, totalPosts)

  function handleMarkRead(postId: string, numComments: number) {
    state.markRead(postId, Date.now(), numComments)
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

  function handleMarkAllRead(sub: string) {
    const now = Date.now()
    const posts = filtered![sub] ?? []
    for (const post of posts) {
      if (!state.isRead(post.id)) {
        state.markRead(post.id, now, post.numComments)
      }
    }
    if (runtime) void state.saveToStorage(runtime)
    forceUpdate((n) => n + 1)
  }

  function handleToggleSub(sub: string) {
    expandCollapse.toggleSub(sub, totalPosts)
    forceUpdate((n) => n + 1)
  }

  return (
    <div class="gm-sp-reddit">
      {allSubs.map((sub) => {
        const visiblePosts = state.filterVisible(filtered[sub] ?? [])
        if (visiblePosts.length === 0) return null
        const isActive = active.has(sub)
        const collapsedClass = isActive ? '' : ' gm-sp-reddit-section-collapsed'
        const caretClass = showCaret ? ' gm-sp-reddit-caret-visible' : ''
        return (
          <section class={`gm-sp-reddit-section${collapsedClass}`} data-sub={escapeHtml(sub)}>
            <h3
              class="gm-sp-reddit-sub-title"
              data-sub={escapeHtml(sub)}
              onClick={() => handleToggleSub(sub)}
            >
              <span class={`gm-sp-reddit-caret${caretClass}`}>▾</span>
              r/{escapeHtml(sub)}
              <button
                type="button"
                class="gm-sp-date-filter-btn gm-sp-archive-btn"
                title="归档：标记该 subreddit 所有主题为已读"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMarkAllRead(sub)
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
                const commentCount = formatCommentCount(
                  post.numComments,
                  state.getReadReplies(post.id),
                )
                return (
                  <li
                    class={`gm-sp-list-item gm-sp-list-item-flex${state.isRead(post.id) ? ' gm-sp-item-read' : ''}`}
                    data-post-id={post.id}
                  >
                    <span class="gm-sp-reddit-source" title={badge.title}>
                      {badge.icon}
                    </span>
                    <span class="gm-sp-item-count" title="评论数">
                      {commentCount}
                    </span>
                    <a
                      class="gm-sp-item-title"
                      href={escapeUrl(post.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleMarkRead(post.id, post.numComments)}
                      dangerouslySetInnerHTML={{ __html: escapeHtml(post.title) + titleSuffix }}
                    />
                    <span class="gm-sp-reddit-score" title="得分">
                      🏆{post.score}
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
