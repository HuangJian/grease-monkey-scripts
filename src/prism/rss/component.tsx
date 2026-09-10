import { useReducer, useState } from 'preact/hooks'
import { escapeUrl } from '../../utils'
import { createItemHandlers } from '../item-actions'
import { ExpandableList, useExpandScroll } from '../shared/expandable-list'
import { ItemActions } from '../shared/item-actions'
import type { Runtime } from '../../runtime'
import type { SourceComponentProps } from '../types'
import { FOLD_THRESHOLD, TIMELINE_MAX_ITEMS } from './constants'
import { visibleUnreadItems, type RssState } from './state'
import type { RssFeed, RssItem, RssViewMode } from './types'

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
  viewMode: RssViewMode
  /** Persists the choice; the local state switches the view immediately. */
  onViewModeChange?: ((mode: RssViewMode) => void) | undefined
}

/** An entry together with the feed it came from (timeline rows need the label). */
type RssEntry = { item: RssItem; feed: RssFeed }

type SharedRowProps = {
  state: RssState
  runtime: Runtime
  root: RssComponentProps['root']
  onNotify?: (() => void) | undefined
}

export function RssComponent({
  data,
  root,
  runtime,
  state,
  viewMode,
  onViewModeChange,
  onNotify,
}: RssComponentProps) {
  const [mode, setMode] = useState<RssViewMode>(viewMode)
  const feeds = data ?? []

  if (feeds.length === 0) {
    return (
      <div class="gm-sp-rss">
        <div class="gm-sp-empty">尚未添加订阅源，请通过 ⚙ 添加或导入 OPML</div>
      </div>
    )
  }

  function switchTo(next: RssViewMode) {
    setMode(next)
    onViewModeChange?.(next)
  }

  const rowProps: SharedRowProps = { state, runtime, root, onNotify }

  return (
    <div class="gm-sp-rss">
      <div class="gm-sp-rss-viewbar">
        {(
          [
            ['grouped', '分组'],
            ['timeline', '时间线'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            class={`gm-sp-rss-viewbtn${mode === value ? ' gm-sp-rss-viewbtn-active' : ''}`}
            data-action={`view-${value}`}
            onClick={() => switchTo(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'grouped' ? (
        feeds.map((feed) => <FeedBlock key={feed.id} feed={feed} {...rowProps} />)
      ) : (
        <Timeline feeds={feeds} {...rowProps} />
      )}
    </div>
  )
}

function timeTitleOf(entry: RssEntry): string {
  return entry.item.pubDate > 0 ? FULL_TIME_FMT.format(new Date(entry.item.pubDate)) : '未知时间'
}

/**
 * Row behaviour shared by both views. Clicking only expands: the lists render
 * unread entries only, so marking read here would drop the row before its
 * summary could be read. Read is set when the original is opened (as novels
 * does for chapters) or through bulk-read.
 */
function useRowHandlers(props: SharedRowProps, siblings: RssItem[]) {
  const { state, runtime, root, onNotify } = props
  const [, forceRender] = useReducer<number, void>((n) => n + 1, 0)
  const { scrollIfNeeded } = useExpandScroll(root)

  return {
    forceRender,
    onRowClick(item: RssItem) {
      scrollIfNeeded(item.id)
      siblings
        .filter((other) => other.id !== item.id)
        .forEach((other) => state.setExpanded(other.id, false))
      state.toggleExpanded(item.id)
      forceRender()
    },
    onOpen(item: RssItem) {
      state.markRead(item.id)
      void state.saveToStorage(runtime)
      onNotify?.()
      forceRender()
    },
  }
}

function FeedBlock({ feed, ...rowProps }: SharedRowProps & { feed: RssFeed }) {
  const { state, runtime } = rowProps
  const [userExpanded, setUserExpanded] = useState(false)
  const unread = visibleUnreadItems(feed, state)
  const { forceRender, onRowClick, onOpen } = useRowHandlers(rowProps, unread)

  const folded = unread.length > FOLD_THRESHOLD
  const isFolded = folded && !userExpanded
  const shown = isFolded ? unread.slice(0, 2) : unread

  const { handleHide, handleBulkRead } = createItemHandlers<RssItem>({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getVisible: () => visibleUnreadItems(feed, state),
  })

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
          <ItemList
            entries={shown.map((item) => ({ item, feed }))}
            state={state}
            onRowClick={onRowClick}
            onOpen={onOpen}
            onBulkRead={(entry) => handleBulkRead(entry.item)}
            onHide={(entry) => handleHide(entry.item.id)}
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

function Timeline({ feeds, ...rowProps }: SharedRowProps & { feeds: RssFeed[] }) {
  const { state, runtime } = rowProps
  const entries: RssEntry[] = feeds
    .flatMap((feed) => visibleUnreadItems(feed, state).map((item) => ({ item, feed })))
    .sort((a, b) => b.item.pubDate - a.item.pubDate)
  const shown = entries.slice(0, TIMELINE_MAX_ITEMS)
  const { forceRender, onRowClick, onOpen } = useRowHandlers(
    rowProps,
    shown.map((entry) => entry.item),
  )

  const { handleHide, handleBulkRead } = createItemHandlers<RssItem>({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getVisible: () => shown.map((entry) => entry.item),
  })

  if (shown.length === 0) {
    return (
      <div class="gm-sp-rss">
        <div class="gm-sp-empty">没有未读条目</div>
      </div>
    )
  }

  return (
    <div class="gm-sp-rss-timeline">
      <ItemList
        entries={shown}
        state={state}
        onRowClick={onRowClick}
        onOpen={onOpen}
        onBulkRead={(entry) => handleBulkRead(entry.item)}
        onHide={(entry) => handleHide(entry.item.id)}
        containerClassName="gm-sp-rss-items"
        showFeedLabel
      />
      {entries.length > shown.length ? (
        <div class="gm-sp-rss-more">{`仅显示最近 ${TIMELINE_MAX_ITEMS} 条未读`}</div>
      ) : null}
    </div>
  )
}

function ItemList({
  entries,
  state,
  onRowClick,
  onOpen,
  onBulkRead,
  onHide,
  containerClassName,
  showFeedLabel = false,
}: {
  entries: RssEntry[]
  state: RssState
  onRowClick: (item: RssItem) => void
  onOpen: (item: RssItem) => void
  onBulkRead: (entry: RssEntry) => void
  onHide: (entry: RssEntry) => void
  containerClassName: string
  showFeedLabel?: boolean
}) {
  return (
    <ExpandableList
      items={entries}
      getItemId={(entry) => entry.item.id}
      isExpanded={(id) => state.isExpanded(id)}
      isHidden={(id) => state.isHidden(id)}
      onRowClick={(entry) => onRowClick(entry.item)}
      getTime={(entry) => entry.item.pubDate || undefined}
      timeFormat="date-time"
      timeTitle={timeTitleOf}
      titleAttr={(entry) => entry.item.title || '(无标题)'}
      renderTitle={(entry) => entry.item.title || '(无标题)'}
      renderExtra={
        showFeedLabel
          ? (entry) => <span class="gm-sp-rss-feed-tag">{entry.feed.title}</span>
          : undefined
      }
      renderBody={(entry) => <ItemBody item={entry.item} onOpen={() => onOpen(entry.item)} />}
      renderActions={(entry) => (
        <ItemActions onBulkRead={() => onBulkRead(entry)} onHide={() => onHide(entry)} />
      )}
      containerClassName={containerClassName}
    />
  )
}

/** Summary body: plain text only (plan D9) plus a link out to the original. */
function ItemBody({ item, onOpen }: { item: RssItem; onOpen: () => void }) {
  return (
    <div class="gm-sp-rss-body">
      {item.author ? <div class="gm-sp-rss-author">{item.author}</div> : null}
      <p class="gm-sp-rss-summary">
        {item.summaryText || (item.summaryTrimmed ? '摘要已裁剪，点击打开原文' : '（无摘要）')}
      </p>
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
