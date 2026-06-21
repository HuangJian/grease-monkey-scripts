import { useState } from 'preact/hooks'
import type { AuthorTagMap } from '../../shared/author-labels'
import { authorClass, buildAuthorTagHtml, getTotalScore } from '../../shared/author-labels'
import { escapeHtml, escapeUrl } from '../../utils'
import { ItemActions } from '../card/primitives'
import type { DateFilter } from '../date-filter'
import { createItemHandlers } from '../item-actions'
import { applyDateFilter, formatReplyCount } from '../shared-utils'
import type { SourceComponentProps } from '../types'
import type { V2exState } from './state'
import type { V2exTopic } from './types'

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

  const dateFiltered = applyDateFilter(data, dateFilter, (t) => t.created) ?? []
  const visible =
    dateFilter === '未'
      ? dateFiltered.filter((t) => !state.isRead(t.id))
      : state.filterVisible(dateFiltered)

  function handleMarkRead(topic: V2exTopic) {
    state.markRead(topic.id, Date.now(), topic.replies)
    if (runtime) void state.saveToStorage(runtime)
    forceUpdate((n) => n + 1)
  }

  const { handleHide, handleBulkRead, handleBulkHide } = createItemHandlers<V2exTopic>({
    state,
    runtime,
    forceUpdate: () => forceUpdate((n) => n + 1),
    getVisible: () => visible,
    repliesOf: (t) => t.replies,
  })

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
              <ItemActions
                onHide={() => handleHide(topic.id)}
                onBulkRead={() => handleBulkRead(topic)}
                onBulkHide={() => handleBulkHide(topic)}
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
