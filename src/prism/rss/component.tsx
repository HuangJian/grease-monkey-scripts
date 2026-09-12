import { useEffect, useReducer, useState } from 'preact/hooks'
import { escapeUrl } from '../../utils'
import { createItemHandlers } from '../item-actions'
import { ExpandableList, useExpandScroll } from '../shared/expandable-list'
import { ItemActions } from '../shared/item-actions'
import type { Runtime } from '../../runtime'
import type { SourceComponentProps } from '../types'
import { FOLD_THRESHOLD, TIMELINE_MAX_ITEMS } from './constants'
import type { FeedSchedule } from './schedule'
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

/** How often the countdown labels re-render; they are the only time-dependent UI here. */
const SCHEDULE_TICK_MS = 30_000

/** "每 30 分钟" / "每 12 小时" / "每 7 天" — the interval a feed currently follows. */
export function formatIntervalLabel(intervalMs: number): string {
  const minutes = Math.max(1, Math.round(intervalMs / 60_000))
  if (minutes < 60) return `每 ${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `每 ${hours} 小时`
  return `每 ${Math.round(hours / 24)} 天`
}

/** "8 分钟后" / "3 小时后" / "1 天后" — time until the feed is fetched again. */
export function formatCountdownLabel(remainingMs: number): string {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  if (minutes < 60) return `${minutes} 分钟后`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时后`
  return `${Math.round(hours / 24)} 天后`
}

/**
 * Self-ticking "now" so the countdowns stay truthful between refreshes.
 * Mirrors `card/primitives.tsx`'s RefreshTime; one tick for the whole card, not
 * one per feed.
 */
function useTickingNow(runtime: Runtime): number {
  const [now, setNow] = useState(() => runtime.now())
  useEffect(() => {
    const id = runtime.setInterval(() => setNow(runtime.now()), SCHEDULE_TICK_MS)
    return () => runtime.clearInterval(id)
  }, [runtime])
  return now
}

export type RssComponentProps = SourceComponentProps<RssFeed[]> & {
  state: RssState
  viewMode: RssViewMode
  /** Persists the choice; the local state switches the view immediately. */
  onViewModeChange?: ((mode: RssViewMode) => void) | undefined
  /**
   * Schedules for the header hints, injected by the source (which owns the
   * options). Optional so previews and tests can render the card without them.
   */
  scheduleHint?: ((feed: RssFeed, now: number) => FeedSchedule) | undefined
}

/** An entry together with the feed it came from (timeline rows need the label). */
type RssEntry = { item: RssItem; feed: RssFeed }

/**
 * Feeds the UI shows. A disabled feed keeps its cached entries (so re-enabling
 * is instant) but is rendered by nobody — including the tab badge.
 */
export function visibleFeeds(feeds: ReadonlyArray<RssFeed>): RssFeed[] {
  return feeds.filter((feed) => feed.enabled !== false)
}

type SharedRowProps = {
  state: RssState
  runtime: Runtime
  root: RssComponentProps['root']
  onNotify?: (() => void) | undefined
  /** Tick used by the countdown labels; see `useTickingNow`. */
  now: number
  scheduleHint?: ((feed: RssFeed, now: number) => FeedSchedule) | undefined
}

export function RssComponent({
  data,
  root,
  runtime,
  state,
  viewMode,
  onViewModeChange,
  onNotify,
  scheduleHint,
}: RssComponentProps) {
  const [mode, setMode] = useState<RssViewMode>(viewMode)
  // The editor saves the view mode as well, so follow the prop when it changes
  // under us: a local-only state would ignore that write until a reload.
  useEffect(() => setMode(viewMode), [viewMode])
  const now = useTickingNow(runtime)

  const feeds = visibleFeeds(data ?? [])

  if (feeds.length === 0) {
    const message =
      (data ?? []).length === 0
        ? '尚未添加订阅源，请通过 ⚙ 添加或导入 OPML'
        : '所有订阅源均已禁用，请通过 ⚙ 重新启用'
    return (
      <div class="gm-sp-rss">
        <div class="gm-sp-empty">{message}</div>
      </div>
    )
  }

  function switchTo(next: RssViewMode) {
    setMode(next)
    onViewModeChange?.(next)
  }

  const rowProps: SharedRowProps = { state, runtime, root, onNotify, now, scheduleHint }

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
  const { state, runtime, now, scheduleHint } = rowProps
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

  // Freshness is per feed, so say when this one is fetched next instead of
  // leaving the card's single "数据陈旧" badge to imply the whole source is late.
  const schedule = scheduleHint?.(feed, now)
  const retryInMs = feed.nextRetryAt === undefined ? 0 : feed.nextRetryAt - now

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

      {schedule ? (
        <div class="gm-sp-rss-feed-schedule">
          {schedule.nextFetchAt > now
            ? `${formatIntervalLabel(schedule.intervalMs)} · 下次 ${formatCountdownLabel(
                schedule.nextFetchAt - now,
              )}`
            : `${formatIntervalLabel(schedule.intervalMs)} · 待刷新`}
        </div>
      ) : null}

      {feed.error ? (
        <div class="gm-sp-rss-feed-error">
          {`刷新失败：${feed.error}`}
          {retryInMs > 0 ? `（${formatCountdownLabel(retryInMs)}重试）` : ''}
        </div>
      ) : null}

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
