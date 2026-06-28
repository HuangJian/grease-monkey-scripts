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
import type { HupuState } from './state'
import type { HupuRenderData } from './source'

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
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)

  const dateFiltered = applyGroupedDateFilter(data ?? {}, dateFilter, (t) => t.created)
  const filtered: HupuRenderData =
    dateFilter === '未'
      ? Object.entries(dateFiltered).reduce<HupuRenderData>((acc, [board, posts]) => {
          const unread = posts.filter((p) => !state.isRead(p.id))
          if (unread.length > 0) acc[board] = unread
          return acc
        }, {})
      : dateFiltered

  if (Object.keys(filtered).length === 0) {
    return <div class="gm-sp-empty">暂无数据</div>
  }

  const allBoards = Object.keys(filtered)
  const totalPosts = Object.values(filtered).reduce((sum, posts) => sum + posts.length, 0)
  const showCaret = totalPosts > COLLAPSE_THRESHOLD
  const active = expandCollapse.activeCategories(allBoards, totalPosts)

  function handleMarkRead(postId: string, replies: number) {
    state.markRead(postId, Date.now(), replies)
    void state.saveToStorage(runtime)
    forceRender()
  }

  function findBoardForPost(post: { id: string }): string | null {
    const entry = Object.entries(filtered).find(([, posts]) => posts.some((p) => p.id === post.id))
    return entry ? entry[0] : null
  }

  const { handleHide, handleBulkRead } = createGroupedItemHandlers<
    { id: string; replies: number },
    string
  >({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getSubForItem: findBoardForPost,
    getVisibleInSub: (board) => state.filterVisible(filtered[board] ?? []),
    repliesOf: (p) => p.replies,
  })

  function handleToggleBoard(board: string) {
    expandCollapse.toggleCategory(board, totalPosts)
    forceRender()
  }

  return (
    <div class="gm-sp-hupu">
      {allBoards.map((board) => {
        const visiblePosts = state.filterVisible(filtered[board] ?? [])
        if (visiblePosts.length === 0) return null
        const isActive = active.has(board)
        const collapsedClass = isActive ? '' : ' gm-sp-section-collapsed'
        const caretClass = showCaret ? ' gm-sp-caret-visible' : ''
        return (
          <section class={`gm-sp-section${collapsedClass}`} data-board={escapeHtml(board)}>
            <h3
              class="gm-sp-section-title"
              data-board={escapeHtml(board)}
              onClick={() => handleToggleBoard(board)}
            >
              <span class={`gm-sp-caret${caretClass}`}>▾</span>
              {escapeHtml(board)}
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
                    <span class="gm-sp-section-source" title={badge.title}>
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
                    <span class="gm-sp-section-score" title="亮了">
                      {post.lights}
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
