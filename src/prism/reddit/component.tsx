import { useReducer } from 'preact/hooks'
import type { AuthorTagMap } from '../../shared/author-labels'
import { authorClass, buildAuthorTagHtml, getTotalScore } from '../../shared/author-labels'
import { escapeHtml, escapeUrl } from '../../utils'
import { ItemActions } from '../shared/item-actions'
import type { DateFilter } from '../date-filter'
import { createGroupedItemHandlers } from '../item-actions'
import { applyGroupedDateFilter, formatReplyCount, sourceBadge } from '../shared-utils'
import type { SourceComponentProps } from '../types'
import { COLLAPSE_THRESHOLD, type ExpandCollapse } from '../expand-collapse'
import type { RedditState } from './state'
import type { RedditRenderData } from './source'
import { subredditSpecLabel } from './parser'

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
  error,
}: RedditComponentProps) {
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)

  const raw = data ?? {}
  // 抓取失败时，日期分桶常把整段历史判到"今天之前"，于是错误横幅下面只剩
  // 「暂无数据」——看起来像数据丢了。此时退回「全」，但只在筛选确实把一切挡在
  // 外面时才退回，不覆盖用户主动选择的桶。
  const dateFiltered = applyGroupedDateFilter(raw, dateFilter, (t) => t.created, runtime.now)
  const filterHidesEverything =
    dateFilter !== '全' && Object.keys(dateFiltered).length === 0 && Object.keys(raw).length > 0
  const fallbackToAll = !!error && filterHidesEverything
  const effective = fallbackToAll
    ? applyGroupedDateFilter(raw, '全', (t) => t.created, runtime.now)
    : dateFiltered
  const filtered: RedditRenderData = filterUnread
    ? Object.entries(effective).reduce<RedditRenderData>((acc, [sub, posts]) => {
        const unread = posts.filter((p) => !state.isRead(p.id))
        if (unread.length > 0) acc[sub] = unread
        return acc
      }, {})
    : effective

  if (Object.keys(filtered).length === 0) {
    return <div class="gm-sp-empty">暂无数据</div>
  }

  const allSubs = Object.keys(filtered)
  const totalPosts = Object.values(filtered).reduce((sum, posts) => sum + posts.length, 0)
  const showCaret = totalPosts > COLLAPSE_THRESHOLD
  const active = expandCollapse.activeCategories(allSubs, totalPosts)

  function handleMarkRead(postId: string, numComments: number) {
    state.markRead(postId, runtime.now(), numComments)
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
      {fallbackToAll ? <div class="gm-sp-empty">抓取失败，已显示全部历史</div> : null}
      {allSubs.map((sub) => {
        const visiblePosts = state.filterVisible(filtered[sub] ?? [])
        if (visiblePosts.length === 0) return null
        const isActive = active.has(sub)
        const collapsedClass = isActive ? '' : ' gm-sp-section-collapsed'
        const caretClass = showCaret ? ' gm-sp-caret-visible' : ''
        return (
          <section class={`gm-sp-section${collapsedClass}`} data-sub={sub}>
            <h3
              class="gm-sp-section-title"
              data-sub={sub}
              title={subredditSpecLabel(sub)}
              onClick={() => handleToggleSub(sub)}
            >
              <span class={`gm-sp-caret${caretClass}`}>▾</span>
              {subredditSpecLabel(sub)}
            </h3>
            <ol class="gm-sp-list">
              {visiblePosts.map((post) => {
                const badge = sourceBadge(post.created, runtime.now)
                const author = post.author
                const authorTags = author ? authorTagMap[author] : undefined
                const hasTags = !!authorTags && Object.keys(authorTags).length > 0
                const ac = authorClass(authorTags ? getTotalScore(authorTags) : 0)
                const titleSuffix = buildAuthorTagHtml(authorTags, escapeHtml)
                const authorText = author ? `@${author}` : ''
                // The Atom feed carries no counts; rendering the zero placeholder
                // would read as "0 comments" on posts that actually have hundreds.
                const showsMetrics = post.metrics !== false
                const commentCount = showsMetrics
                  ? formatReplyCount(post.numComments, state.getReadReplies(post.id))
                  : ''
                return (
                  <li
                    key={post.id}
                    class={`gm-sp-list-item gm-sp-list-item-flex${hasTags ? ' gm-sp-item-tagged' : ''}${ac}${state.isRead(post.id) ? ' gm-sp-item-read' : ''}`}
                    data-post-id={post.id}
                  >
                    <span class="gm-sp-section-source" title={badge.title}>
                      {badge.icon}
                    </span>
                    {showsMetrics ? (
                      <span class="gm-sp-item-count" title="评论数">
                        {commentCount}
                      </span>
                    ) : null}
                    <a
                      class="gm-sp-item-title"
                      href={escapeUrl(post.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleMarkRead(post.id, post.numComments)}
                      dangerouslySetInnerHTML={{ __html: escapeHtml(post.title) + titleSuffix }}
                    />
                    {showsMetrics ? (
                      <span class="gm-sp-section-score" title="得分">
                        🏆{post.score}
                      </span>
                    ) : null}
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
