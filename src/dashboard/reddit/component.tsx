import { useState } from 'preact/hooks'
import type { AuthorTagMap } from '../../shared/author-labels'
import { authorClass, buildAuthorTagHtml, getTotalScore } from '../../shared/author-labels'
import { escapeHtml, escapeUrl } from '../../utils'
import type { SourceComponentProps } from '../types'
import type { ExpandCollapse } from './expand-collapse'
import { COLLAPSE_THRESHOLD } from './expand-collapse'
import type { RedditState } from './state'
import type { RedditRenderData } from './source'

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
}

export function RedditComponent({
  data,
  runtime,
  state,
  expandCollapse,
  authorTagMap,
}: RedditComponentProps) {
  const [, forceUpdate] = useState(0)

  if (!data || Object.keys(data).length === 0) {
    return <div class="gm-sp-empty">暂无数据</div>
  }

  const allSubs = Object.keys(data)
  let totalPosts = 0
  for (const posts of Object.values(data)) totalPosts += posts.length
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
    const posts = data![sub] ?? []
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
        const visiblePosts = state.filterVisible(data[sub] ?? [])
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
                class="gm-sp-reddit-mark-all-read"
                onClick={(e) => {
                  e.stopPropagation()
                  handleMarkAllRead(sub)
                }}
              >
                全部已读
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
                      {post.score}
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
