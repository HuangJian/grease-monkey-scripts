import { useReducer, useState } from 'preact/hooks'
import { escapeUrl } from '../../utils'
import { createItemHandlers } from '../item-actions'
import { ExpandableList, useExpandScroll } from '../shared/expandable-list'
import { ItemActions } from '../shared/item-actions'
import type { Runtime } from '../../runtime'
import type { SourceComponentProps } from '../types'
import { FOLD_THRESHOLD } from './constants'
import { unreadItems, type RssState } from './state'
import type { RssFeed, RssItem } from './types'

const FULL_TIME_FMT = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export type RssComponentProps = SourceComponentProps<RssFeed[]> & {
  state: RssState
}

export function RssComponent({ data, root, runtime, state, onNotify }: RssComponentProps) {
  const feeds = data ?? []

  if (feeds.length === 0) {
    return (
      <div class="gm-sp-rss">
        <div class="gm-sp-empty">尚未添加订阅源，请通过 ⚙ 添加或导入 OPML</div>
      </div>
    )
  }

  return (
    <div class="gm-sp-rss">
      {feeds.map((feed) => (
        <FeedBlock
          key={feed.id}
          feed={feed}
          state={state}
          runtime={runtime}
          root={root}
          onNotify={onNotify}
        />
      ))}
    </div>
  )
}

type FeedBlockProps = {
  feed: RssFeed
  state: RssState
  runtime: Runtime
  root: RssComponentProps['root']
  onNotify?: (() => void) | undefined
}

function FeedBlock({ feed, state, runtime, root, onNotify }: FeedBlockProps) {
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)
  const { scrollIfNeeded } = useExpandScroll(root)
  const [userExpanded, setUserExpanded] = useState(false)

  const unread = unreadItems(feed, state)
  const folded = unread.length > FOLD_THRESHOLD
  const isFolded = folded && !userExpanded
  const shown = isFolded ? unread.slice(0, 2) : unread

  const { handleHide, handleBulkRead } = createItemHandlers<RssItem>({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getVisible: () => unreadItems(feed, state),
  })

  // Clicking a row only expands it: marking read here would drop the entry out
  // of the unread-only list before its summary could be read. Read is set when
  // the original is opened (as novels does for chapters) or via bulk-read.
  function handleRowClick(item: RssItem) {
    scrollIfNeeded(item.id)
    unread
      .filter((other) => other.id !== item.id)
      .forEach((other) => state.setExpanded(other.id, false))
    state.toggleExpanded(item.id)
    forceRender()
  }

  function handleOpen(item: RssItem) {
    state.markRead(item.id)
    void state.saveToStorage(runtime)
    onNotify?.()
    forceRender()
  }

  return (
    <div class="gm-sp-rss-feed" data-feed-id={feed.id}>
      <div class="gm-sp-rss-feed-header">
        <a
          class="gm-sp-rss-feed-title"
          href={escapeUrl(feed.url)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {feed.title}
        </a>
        {unread.length > 0 ? (
          <span class="gm-sp-rss-feed-status">{`${unread.length} 条未读`}</span>
        ) : (
          <span class="gm-sp-rss-feed-status gm-sp-rss-feed-status-none">无新条目</span>
        )}
      </div>

      {feed.error ? <div class="gm-sp-rss-feed-error">{`刷新失败：${feed.error}`}</div> : null}

      {unread.length > 0 ? (
        <>
          <ExpandableList
            items={shown}
            getItemId={(item) => item.id}
            isExpanded={(id) => state.isExpanded(id)}
            isHidden={(id) => state.isHidden(id)}
            onRowClick={handleRowClick}
            getTime={(item) => item.pubDate || undefined}
            timeFormat="date-time"
            timeTitle={(item) =>
              item.pubDate > 0 ? FULL_TIME_FMT.format(new Date(item.pubDate)) : '未知时间'
            }
            titleAttr={(item) => item.title || '(无标题)'}
            renderTitle={(item) => item.title || '(无标题)'}
            renderBody={(item) => <ItemBody item={item} onOpen={() => handleOpen(item)} />}
            renderActions={(item) => (
              <ItemActions
                onBulkRead={() => handleBulkRead(item)}
                onHide={() => handleHide(item.id)}
              />
            )}
            containerClassName="gm-sp-rss-items"
          />
          {folded ? (
            <button
              type="button"
              class="gm-sp-rss-toggle"
              data-action="toggle-fold"
              onClick={() => setUserExpanded(!userExpanded)}
            >
              {isFolded ? `…还有 ${unread.length - shown.length} 条未读` : '收起未读条目'}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/** Summary body: plain text only (plan D9) plus a link out to the original. */
function ItemBody({ item, onOpen }: { item: RssItem; onOpen: () => void }) {
  return (
    <div class="gm-sp-rss-body">
      {item.author ? <div class="gm-sp-rss-author">{item.author}</div> : null}
      <p class="gm-sp-rss-summary">{item.summaryText || '（无摘要）'}</p>
      <a
        class="gm-sp-rss-open"
        data-action="open-original"
        href={escapeUrl(item.link)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpen}
      >
        打开原文
      </a>
    </div>
  )
}
