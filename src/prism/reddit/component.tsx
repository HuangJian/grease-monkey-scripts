import { useReducer } from 'preact/hooks'
import type { AuthorTagMap } from '../../shared/author-labels'
import { authorClass, buildAuthorTagHtml, getTotalScore } from '../../shared/author-labels'
import { escapeHtml, escapeUrl } from '../../utils'
import { ItemActions } from '../card/primitives'
import type { DateFilter } from '../date-filter'
import { createGroupedItemHandlers } from '../item-actions'
import { applyGroupedDateFilter, formatReplyCount, sourceBadge } from '../shared-utils'
import type { SourceComponentProps } from '../types'
import { COLLAPSE_THRESHOLD, type ExpandCollapse } from '../expand-collapse'
import type { RedditState } from './state'
import type { RedditRenderData } from './source'

export type RedditComponentProps = SourceComponentProps<RedditRenderData> & {
  state: RedditState
  expandCollapse: ExpandCollapse
  authorTagMap: AuthorTagMap
  dateFilter: DateFilter
  filterUnread: boolean
}

export function RedditComponent({
  data,
  runtime,
  state,
  expandCollapse,
  authorTagMap,
  dateFilter,
  filterUnread,
}: RedditComponentProps) {
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)

  const dateFiltered = applyGroupedDateFilter(data ?? {}, dateFilter, (t) => t.created)
  const filtered: RedditRenderData = filterUnread
    ? Object.entries(dateFiltered).reduce<RedditRenderData>((acc, [sub, posts]) => {
        const unread = posts.filter((p) => !state.isRead(p.id))
        if (unread.length > 0) acc[sub] = unread
        return acc
      }, {})
    : dateFiltered

  if (Object.keys(filtered).length === 0) {
    return <div class="gm-sp-empty">暂无数据</div>
  }

  const allSubs = Object.keys(filtered)
  const totalPosts = Object.values(filtered).reduce((sum, posts) => sum + posts.length, 0)
  const showCaret = totalPosts > COLLAPSE_THRESHOLD
  const active = expandCollapse.activeCategories(allSubs, totalPosts)

  function handleMarkRead(postId: string, numComments: number) {
    state.markRead(postId, Date.now(), numComments)
    void state.saveToStorage(runtime)
    forceRender()
  }

  function findSubForPost(post: { id: string }): string | null {
    const entry = Object.entries(filtered).find(([, posts]) => posts.some((p) => p.id === post.id))
    return entry ? entry[0] : null
  }

  const { handleHide, handleBulkRead } = createGroupedItemHandlers<
    { id: string; numComments: number },
    string
  >({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getSubForItem: findSubForPost,
    getVisibleInSub: (sub) => state.filterVisible(filtered[sub] ?? []),
    repliesOf: (p) => p.numComments,
  })

  function handleToggleSub(sub: string) {
    expandCollapse.toggleCategory(sub, totalPosts)
    forceRender()
  }

  return (
    <div class="gm-sp-reddit">
      {allSubs.map((sub) => {
        const visiblePosts = state.filterVisible(filtered[sub] ?? [])
        if (visiblePosts.length === 0) return null
        const isActive = active.has(sub)
        const collapsedClass = isActive ? '' : ' gm-sp-section-collapsed'
        const caretClass = showCaret ? ' gm-sp-caret-visible' : ''
        return (
          <section class={`gm-sp-section${collapsedClass}`} data-sub={escapeHtml(sub)}>
            <h3
              class="gm-sp-section-title"
              data-sub={escapeHtml(sub)}
              onClick={() => handleToggleSub(sub)}
            >
              <span class={`gm-sp-caret${caretClass}`}>▾</span>
              r/{escapeHtml(sub)}
            </h3>
            <ol class="gm-sp-list">
              {visiblePosts.map((post) => {
                const badge = sourceBadge(post.created)
                const author = post.author
                const authorTags = author ? authorTagMap[author] : undefined
                const hasTags = !!authorTags && Object.keys(authorTags).length > 0
                const ac = authorClass(authorTags ? getTotalScore(authorTags) : 0)
                const titleSuffix = buildAuthorTagHtml(authorTags, escapeHtml)
                const authorText = author ? `@${escapeHtml(author)}` : ''
                const commentCount = formatReplyCount(
                  post.numComments,
                  state.getReadReplies(post.id),
                )
                return (
                  <li
                    key={post.id}
                    class={`gm-sp-list-item gm-sp-list-item-flex${hasTags ? ' gm-sp-item-tagged' : ''}${ac}${state.isRead(post.id) ? ' gm-sp-item-read' : ''}`}
                    data-post-id={post.id}
                  >
                    <span class="gm-sp-section-source" title={badge.title}>
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
                    <span class="gm-sp-section-score" title="得分">
                      🏆{post.score}
                    </span>
                    <span class={`gm-sp-section-author${ac}`}>{authorText}</span>
                    <ItemActions
                      onBulkRead={() => handleBulkRead(post)}
                      onHide={() => handleHide(post.id)}
                    />
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
