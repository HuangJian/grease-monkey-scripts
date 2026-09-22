import { useEffect, useLayoutEffect, useReducer, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { escapeUrl } from '../../utils'
import { createGroupedItemHandlers, createItemHandlers } from '../item-actions'
import {
  DateFilterGroup,
  DAY_SECTION_LABELS,
  DAY_SECTIONS,
  daySectionOf,
  type DateFilter,
  type DaySection,
} from '../date-filter'
import { ExpandableList, useExpandScroll } from '../shared/expandable-list'
import { ItemActions } from '../shared/item-actions'
import { applyDateFilter } from '../shared-utils'
import type { Runtime } from '../../runtime'
import type { SourceComponentProps } from '../types'
import { FOLD_THRESHOLD, TIMELINE_HIGH_FREQUENCY, TIMELINE_MAX_ITEMS } from './constants'
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

/** "每 2 小时 · 下次 8 小时后" / "每 2 小时 · 待刷新" — the hint line under a title. */
export function scheduleLabel(schedule: FeedSchedule, now: number): string {
  const interval = formatIntervalLabel(schedule.intervalMs)
  return schedule.nextFetchAt > now
    ? `${interval} · 下次 ${formatCountdownLabel(schedule.nextFetchAt - now)}`
    : `${interval} · 待刷新`
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
   * Timeline date filter (全/今/昨/前/早). Kept outside the component so it
   * survives a tab switch, like every other source's filter (v2ex/xueqiu).
   */
  dateFilter: DateFilter
  onDateFilterChange: (filter: DateFilter) => void
  /**
   * Hides sources that have nothing unread (the 「未」 checkbox beside the date
   * filter). The timeline shows unread entries only, so this is mostly what
   * keeps「无新条目」blocks from occupying the grouped view.
   */
  filterUnread: boolean
  onToggleFilterUnread: () => void
  /**
   * Schedules for the header hints, injected by the source (which owns the
   * options). Optional so previews and tests can render the card without them.
   */
  scheduleHint?: ((feed: RssFeed, now: number) => FeedSchedule) | undefined
}

/** An entry together with the feed it came from (timeline rows need the label). */
type RssEntry = { item: RssItem; feed: RssFeed }

/** Which day section the reader is in, plus how many entries it holds. */
export type ActiveDay = { section: DaySection; total: number }

/**
 * Feeds the UI shows. A disabled feed keeps its cached entries (so re-enabling
 * is instant) but is rendered by nobody — including the tab badge.
 */
export function visibleFeeds(feeds: ReadonlyArray<RssFeed>): RssFeed[] {
  return feeds.filter((feed) => feed.enabled !== false)
}

/**
 * The entries a feed contributes to the current view: unread, not hidden, and
 * inside the active date range.
 *
 * The grouped list and the 「未」 filter both go through this, so "this source has
 * nothing to show" means the same thing in both places — a source whose unread
 * entries all sit outside 今天 disappears when 未 is checked, instead of leaving
 * an empty block behind.
 */
function unreadInRange(
  feed: RssFeed,
  state: RssState,
  dateFilter: DateFilter,
  now: number,
): RssItem[] {
  return applyDateFilter(
    visibleUnreadItems(feed, state),
    dateFilter,
    (item) => item.pubDate,
    () => now,
  )
}

type SharedRowProps = {
  state: RssState
  runtime: Runtime
  root: RssComponentProps['root']
  onNotify?: (() => void) | undefined
  /** Tick used by the countdown labels; see `useTickingNow`. */
  now: number
  /** Applies to both views: the grouped lists narrow too. */
  dateFilter: DateFilter
  /**
   * 「未」 — whether read entries are dropped from the timeline. Only the
   * timeline needs it: an entry opened from a list that shows read entries has
   * to stay in place (greyed) instead of disappearing under the cursor.
   */
  filterUnread: boolean
  scheduleHint?: ((feed: RssFeed, now: number) => FeedSchedule) | undefined
}

export function RssComponent({
  data,
  root,
  runtime,
  state,
  viewMode,
  onViewModeChange,
  dateFilter,
  onDateFilterChange,
  filterUnread,
  onToggleFilterUnread,
  onNotify,
  scheduleHint,
}: RssComponentProps) {
  const [mode, setMode] = useState<RssViewMode>(viewMode)
  // The editor saves the view mode as well, so follow the prop when it changes
  // under us: a local-only state would ignore that write until a reload.
  useEffect(() => setMode(viewMode), [viewMode])
  const now = useTickingNow(runtime)

  const allFeeds = visibleFeeds(data ?? [])
  /**
   * 「未」 hides what has nothing to show **right now** — including the date
   * range, so a source whose unread entries are all from last week stops
   * occupying the list while 今天 is selected.
   *
   * Failing sources stay: the marker that explains what went wrong lives in
   * their block, and hiding it would leave no trace of a broken feed.
   */
  const feeds = filterUnread
    ? allFeeds.filter(
        (feed) => unreadInRange(feed, state, dateFilter, now).length > 0 || feed.error !== '',
      )
    : allFeeds

  if (feeds.length === 0) {
    // Three kinds of empty that must not be confused: nothing configured,
    // everything switched off, and everything already read (filtered out).
    const message =
      allFeeds.length === 0
        ? (data ?? []).length === 0
          ? '尚未添加订阅源，请通过 ⚙ 添加或导入 OPML'
          : '所有订阅源均已禁用，请通过 ⚙ 重新启用'
        : '没有未读条目'
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

  const rowProps: SharedRowProps = {
    state,
    runtime,
    root,
    onNotify,
    now,
    dateFilter,
    filterUnread,
    scheduleHint,
  }

  /**
   * Which day section the reader has scrolled to, reported by the timeline.
   *
   * One label lives in the bar rather than one header row per section: three
   * sections used to cost three lines of vertical space every day, and the
   * label only ever had to answer one question — "am I still in 昨天?".
   */
  const [activeDay, setActiveDay] = useState<ActiveDay | null>(null)

  /** Sources the last refresh could not read — only the timeline needs a summary. */
  const failed = feeds.filter((feed) => feed.error !== '')

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
        {/* Both controls apply to both views: the date filter narrows the
            grouped lists too, and 「未」 hides sources with nothing unread. */}
        <DateFilterGroup
          value={dateFilter}
          onChange={onDateFilterChange}
          filterUnread={filterUnread}
          onToggleFilterUnread={onToggleFilterUnread}
        />
        {mode === 'timeline' && activeDay ? (
          <span class="gm-sp-rss-day-now" data-day-section={activeDay.section}>
            <span class="gm-sp-rss-day-label">{DAY_SECTION_LABELS[activeDay.section]}</span>
            <span class="gm-sp-rss-day-count">{activeDay.total}</span>
          </span>
        ) : null}
        {/*
          Timeline-only: the merged list is built from unread entries, so a feed
          that failed renders as nothing there. It rides in this bar (no row of
          its own) because the grouped view already marks each broken feed with a
          ⚠ beside its title.
        */}
        {mode === 'timeline' && failed.length > 0 ? (
          <FeedFailureNotice feeds={failed} now={now} />
        ) : null}
      </div>
      {mode === 'grouped' ? (
        feeds.map((feed) => <FeedBlock key={feed.id} feed={feed} {...rowProps} />)
      ) : (
        <Timeline feeds={feeds} {...rowProps} onActiveDayChange={setActiveDay} />
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
  const { state, runtime, now, dateFilter, scheduleHint } = rowProps
  const [userExpanded, setUserExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  /** Everything unread, before the date filter narrows it. */
  const unreadAll = visibleUnreadItems(feed, state)
  // The date filter applies to the grouped lists as well (it is not a
  // timeline-only control). The badge still reports the source's own unread
  // count — a source with 5 unread does not become a source with 0 because the
  // reader is looking at today.
  const unread = unreadInRange(feed, state, dateFilter, now)
  const filteredOut = unreadAll.length - unread.length
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
        {/*
          Collapse the whole block. The toggle is its own button rather than a
          click handler on the row: the title is a link to the source site, and
          clicking it must not also fold the block (and a link inside a button
          would be invalid HTML anyway).
        */}
        <button
          type="button"
          class="gm-sp-rss-feed-toggle"
          data-action="toggle-feed"
          aria-expanded={!collapsed}
          title={collapsed ? '展开该订阅源' : '收起该订阅源'}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <a
          class="gm-sp-rss-feed-title"
          href={escapeUrl(feed.url)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {feed.title}
        </a>
        {/*
          Secondary facts live on the title line, not in their own stacked rows:
          the failure marker and when this feed is fetched next. Two 10–12px
          blocks of their own was what made the feed read as a heap.
        */}
        {feed.error ? (
          <span
            class="gm-sp-rss-feed-warn"
            data-action="feed-warning"
            title={`刷新失败：${feed.error}${
              retryInMs > 0 ? `，${formatCountdownLabel(retryInMs)}重试` : ''
            }`}
            aria-label={`刷新失败：${feed.error}`}
          >
            ⚠
          </span>
        ) : null}
        {schedule ? (
          <span class="gm-sp-rss-feed-schedule">{scheduleLabel(schedule, now)}</span>
        ) : null}
        {unreadAll.length > 0 ? (
          <span class="gm-sp-rss-feed-status">{`${unreadAll.length} 条未读`}</span>
        ) : (
          <span class="gm-sp-rss-feed-status gm-sp-rss-feed-status-none">无新条目</span>
        )}
      </div>

      {!collapsed && unread.length > 0 ? (
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

      {/* The filter hid everything this source has: say so instead of letting the
          badge (which counts the whole source) and an empty list contradict. */}
      {!collapsed && unread.length === 0 && filteredOut > 0 ? (
        <div class="gm-sp-rss-feed-schedule">该日期范围内没有未读条目</div>
      ) : null}
    </div>
  )
}

/**
 * How far past the top edge a day group has to be before it counts as "the one
 * you are looking at". Small enough that the label flips exactly when the new
 * section's first row reaches the bar.
 */
const ACTIVE_DAY_TOP_PX = 8

/** The nearest scrollable ancestor, or null when the page itself scrolls. */
function findScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

/**
 * Reports the day section currently under the top of the scroll area — the last
 * one whose top edge has scrolled past it.
 *
 * Two things this must not do, both of which produced a label stuck on 昨天:
 *
 * - Cache the group elements. Preact replaces them whenever the date filter or
 *   the entries change; measuring detached nodes yields all-zero rects, which
 *   reads as "nothing is laid out" and falls back to the first group of a
 *   previous render. The query therefore lives *inside* `update`.
 * - Only run when the scroll fires. Switching 今 → 早 changes which groups exist
 *   without moving anything, so `groupsKey` is what re-runs the measurement.
 *
 * One label in the view bar serves every section, so no section owns a row.
 */
function useActiveDay(
  container: HTMLElement | null,
  /** Re-measure when the rendered groups change, not just when the scroll moves. */
  groupsKey: string,
  onChange: ((day: ActiveDay | null) => void) | undefined,
): void {
  useLayoutEffect(() => {
    if (!onChange || !container) return
    const scroller = findScrollParent(container)
    const target: HTMLElement | Window = scroller ?? window
    let lastKey: string | null = null

    const update = () => {
      const groups = Array.from(container.querySelectorAll<HTMLElement>('.gm-sp-rss-daygroup'))
      if (groups.length === 0) {
        if (lastKey !== null) {
          lastKey = null
          onChange(null)
        }
        return
      }
      // Without a layout engine (tests, serialized previews) every rect is 0,
      // which would read as "all sections are at the top" and land on the last
      // one. Fall back to the first section instead.
      const laidOut = groups.some((group) => group.getBoundingClientRect().height > 0)
      const originTop = scroller ? scroller.getBoundingClientRect().top : 0
      let current = groups[0]!
      if (laidOut) {
        for (const group of groups) {
          if (group.getBoundingClientRect().top - originTop <= ACTIVE_DAY_TOP_PX) current = group
        }
      }
      const day = {
        section: current.dataset['daySection'] as DaySection,
        total: Number(current.dataset['total'] ?? 0),
      }
      const key = `${day.section}:${day.total}`
      if (key === lastKey) return
      lastKey = key
      onChange(day)
    }

    update()
    target.addEventListener('scroll', update, { passive: true })
    return () => {
      target.removeEventListener('scroll', update)
      onChange(null)
    }
  }, [container, groupsKey, onChange])
}

/**
 * The timeline's only trace of a failed source.
 *
 * The merged list is built from **unread entries**, so a feed that failed and
 * has nothing new contributes no rows at all — without this the timeline is
 * indistinguishable from a healthy one. The grouped view marks each broken feed
 * with a ⚠ beside its title, so there this is redundant and not rendered.
 *
 * It rides in the view bar next to the date filter rather than taking a row
 * above the list: a permanent line of its own cost vertical space every day,
 * including the many days nothing is broken. Opening it drops the per-feed
 * reasons under the bar (in flow, not as an overlay — the card clips overflow).
 */
function FeedFailureNotice({ feeds, now }: { feeds: RssFeed[]; now: number }) {
  const [open, setOpen] = useState(false)
  /** "" when the feed is already due for another attempt. */
  const retryOf = (feed: RssFeed): string => {
    const retryInMs = feed.nextRetryAt === undefined ? 0 : feed.nextRetryAt - now
    return retryInMs > 0 ? `${formatCountdownLabel(retryInMs)}重试` : ''
  }
  const detailOf = (feed: RssFeed): string => {
    const retry = retryOf(feed)
    return `${feed.title}：${feed.error}${retry ? `，${retry}` : ''}`
  }

  return (
    <div class="gm-sp-rss-failures">
      <button
        type="button"
        class="gm-sp-rss-failures-toggle"
        data-action="toggle-feed-failures"
        aria-expanded={open}
        title={feeds.map(detailOf).join('\n')}
        onClick={() => setOpen(!open)}
      >
        {`⚠ ${feeds.length} 个源刷新失败`}
      </button>
      {open ? (
        <ul class="gm-sp-rss-failures-list" data-action="feed-failures">
          {feeds.map((feed) => (
            <li key={feed.id}>
              <span class="gm-sp-rss-failures-title">{feed.title}</span>
              <span class="gm-sp-rss-failures-reason">{feed.error}</span>
              {retryOf(feed) ? <span class="gm-sp-rss-failures-retry">{retryOf(feed)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * Merged, newest-first timeline of every feed's unread entries, narrowed by the
 * date filter.
 *
 * Boundaries are computed from the same ticking `now` the countdowns use, so a
 * pinned clock renders deterministically. Entries without a publish date
 * (`pubDate === 0`, legal in RSS) fall outside every bound and are therefore
 * hidden by any filter other than 全 — the same rule v2ex/xueqiu get from the
 * shared helper.
 */
function Timeline({
  feeds,
  onActiveDayChange,
  ...rowProps
}: SharedRowProps & {
  feeds: RssFeed[]
  onActiveDayChange?: ((day: ActiveDay | null) => void) | undefined
}) {
  const { state, runtime, now, dateFilter, filterUnread } = rowProps
  const [container, setContainer] = useState<HTMLElement | null>(null)
  /**
   * Every entry a feed has, minus the hidden ones — read entries included unless
   * 「未」 is checked.
   *
   * The timeline used to render unread entries only, which made 「打开原文」 look
   * like a delete: opening an entry marked it read and the row vanished from
   * under the cursor. Read rows stay and are greyed instead; 「未」 is the
   * control that says "show me only what I have not read".
   */
  const entries: RssEntry[] = feeds
    .flatMap((feed) =>
      feed.items
        .filter((item) => !state.isHidden(item.id))
        .filter((item) => !filterUnread || !state.isRead(item.id))
        .map((item) => ({ item, feed })),
    )
    .sort((a, b) => b.item.pubDate - a.item.pubDate)
  const filtered = applyDateFilter(
    entries,
    dateFilter,
    (entry) => entry.item.pubDate,
    () => now,
  )
  const shown = filtered.slice(0, TIMELINE_MAX_ITEMS)
  /**
   * Split by day on the same local-midnight basis as the date filter, so a
   * filtered timeline and a grouped one never disagree about what 昨天 is.
   * Undated entries get their own trailing section instead of being lumped into
   * 更早 — see `daySectionOf`.
   */
  const sections = DAY_SECTIONS.map((section) => ({
    section,
    entries: shown.filter((entry) => daySectionOf(entry.item.pubDate, now) === section),
  })).filter((group) => group.entries.length > 0)

  /**
   * Collapse firehose sources: within one day section a source that contributes
   * more than `TIMELINE_HIGH_FREQUENCY` entries shows only its newest one, plus
   * 「展开查看更多 N 个主题」. Otherwise one busy feed buries everything else in
   * the merged list. The key is 节 + 源, so expanding one day does not expand
   * the same source everywhere.
   */
  const [expandedSources, setExpandedSources] = useState<ReadonlySet<string>>(() => new Set())

  function toggleSource(key: string): void {
    setExpandedSources((prev) => {
      const next = new Set(prev)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }

  type SourceCluster = { feed: RssFeed; rest: RssEntry[]; key: string }

  type SectionView = {
    section: DaySection
    /** Entries in this day, before any per-source collapsing. */
    total: number
    /** Rows of the merged list: an over-contributing source keeps only its newest. */
    entries: RssEntry[]
    /** The rest of that source's day, keyed by the row it hangs under. */
    clusters: Map<string, SourceCluster>
  }

  const sectionViews: SectionView[] = sections.map((group) => {
    const byFeed = new Map<string, RssEntry[]>()
    for (const entry of group.entries) {
      const list = byFeed.get(entry.feed.id)
      if (list) list.push(entry)
      else byFeed.set(entry.feed.id, [entry])
    }

    const headlines: RssEntry[] = []
    const clusters: SectionView['clusters'] = new Map()
    for (const entry of group.entries) {
      const roster = byFeed.get(entry.feed.id)!
      if (roster.length <= TIMELINE_HIGH_FREQUENCY) {
        headlines.push(entry)
        continue
      }
      // Over the threshold: the source contributes one row plus a cluster. The
      // merged list itself never changes shape when a cluster opens — the extra
      // entries are rendered inside that row (see `SourceClusterRows`), so they
      // stay together instead of being sprinkled through the day by timestamp.
      if (roster[0] !== entry) continue
      headlines.push(entry)
      clusters.set(entry.item.id, {
        feed: entry.feed,
        rest: roster.slice(1),
        key: `${group.section}|${entry.feed.id}`,
      })
    }
    return { section: group.section, total: group.entries.length, entries: headlines, clusters }
  })

  // Re-measure whenever the rendered groups change: the date filter swaps them
  // out without moving the scroll position, so a scroll listener alone would
  // leave the label describing the previous filter.
  useActiveDay(
    container,
    sectionViews.map((group) => `${group.section}:${group.total}`).join('|'),
    onActiveDayChange,
  )

  const visibleEntries = sectionViews.flatMap((group) => group.entries)
  const { forceRender, onRowClick, onOpen } = useRowHandlers(
    rowProps,
    visibleEntries.map((entry) => entry.item),
  )

  /**
   * 「↑已读」 is per source, not per list.
   *
   * The timeline is one merged list of many feeds, so slicing "everything above
   * this row" would mark other sources' newer entries read as well — reading one
   * post in 源 A would silently clear 源 B's unread badge. The grouped variant
   * narrows the slice to the clicked entry's own feed, still in timeline order
   * (newest first) and still inside the active date range.
   */
  const itemsByFeed = new Map<string, RssItem[]>()
  const feedIdOfItem = new Map<string, string>()
  for (const entry of filtered) {
    const list = itemsByFeed.get(entry.feed.id)
    if (list) list.push(entry.item)
    else itemsByFeed.set(entry.feed.id, [entry.item])
    feedIdOfItem.set(entry.item.id, entry.feed.id)
  }

  const { handleHide, handleBulkRead } = createGroupedItemHandlers<RssItem, string>({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getSubForItem: (item) => feedIdOfItem.get(item.id) ?? null,
    getVisibleInSub: (feedId) => itemsByFeed.get(feedId) ?? [],
  })

  if (shown.length === 0) {
    // Say which kind of empty this is: "no unread at all" reads very differently
    // from "your filter matched nothing", and the filter is easy to forget.
    return (
      <div class="gm-sp-rss">
        <div class="gm-sp-empty">
          {entries.length === 0 ? '没有未读条目' : '该日期范围内没有未读条目'}
        </div>
      </div>
    )
  }

  return (
    <div class="gm-sp-rss-timeline" ref={setContainer}>
      {sectionViews.map((group) => (
        // The day header moved to the view bar (one label for whichever section
        // the reader is in), so the group only carries the facts that label
        // needs. The rule between groups is what now separates them — see the
        // `.gm-sp-rss-daygroup + .gm-sp-rss-daygroup` rule in rss.css.
        <div
          class="gm-sp-rss-daygroup"
          key={group.section}
          data-day-section={group.section}
          data-total={group.total}
        >
          <ItemList
            entries={group.entries}
            state={state}
            onRowClick={onRowClick}
            onOpen={onOpen}
            onBulkRead={(entry) => handleBulkRead(entry.item)}
            onHide={(entry) => handleHide(entry.item.id)}
            containerClassName="gm-sp-rss-items"
            showFeedLabel
            renderAfter={(entry) => {
              const cluster = group.clusters.get(entry.item.id)
              if (!cluster) return null
              return (
                <SourceClusterRows
                  key={cluster.key}
                  feed={cluster.feed}
                  rest={cluster.rest}
                  open={expandedSources.has(cluster.key)}
                  onToggle={() => toggleSource(cluster.key)}
                  {...rowProps}
                />
              )
            }}
          />
        </div>
      ))}
      {filtered.length > shown.length ? (
        <div class="gm-sp-rss-more">
          {filterUnread
            ? `仅显示最近 ${TIMELINE_MAX_ITEMS} 条未读`
            : `仅显示最近 ${TIMELINE_MAX_ITEMS} 条`}
        </div>
      ) : null}
    </div>
  )
}

/**
 * One source's remaining entries for a day, rendered as a block under the row
 * that carries the toggle. Collapsed it is a single button; open it is a nested
 * list, so a firehose source's posts stay together instead of being interleaved
 * into the merged timeline by timestamp.
 */
function SourceClusterRows({
  feed,
  rest,
  open,
  onToggle,
  ...rowProps
}: SharedRowProps & {
  feed: RssFeed
  rest: RssEntry[]
  open: boolean
  onToggle: () => void
}) {
  const { state, runtime } = rowProps
  const items = rest.map((entry) => entry.item)
  const { forceRender, onRowClick, onOpen } = useRowHandlers(rowProps, items)
  const { handleHide, handleBulkRead } = createItemHandlers<RssItem>({
    state,
    runtime,
    forceUpdate: () => forceRender(),
    getVisible: () => items,
  })

  return (
    <>
      <button
        type="button"
        class="gm-sp-rss-more-toggle"
        data-action={open ? 'collapse-source' : 'expand-source'}
        onClick={onToggle}
      >
        {open ? `收起 ${feed.title} 的主题` : `展开查看更多 ${rest.length} 个主题 · ${feed.title}`}
      </button>
      {open ? (
        <ItemList
          entries={rest}
          state={state}
          onRowClick={onRowClick}
          onOpen={onOpen}
          onBulkRead={(entry) => handleBulkRead(entry.item)}
          onHide={(entry) => handleHide(entry.item.id)}
          containerClassName="gm-sp-rss-items gm-sp-rss-items-nested"
        />
      ) : null}
    </>
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
  renderAfter,
}: {
  entries: RssEntry[]
  state: RssState
  onRowClick: (item: RssItem) => void
  onOpen: (item: RssItem) => void
  onBulkRead: (entry: RssEntry) => void
  onHide: (entry: RssEntry) => void
  containerClassName: string
  showFeedLabel?: boolean
  renderAfter?: ((entry: RssEntry) => ComponentChildren) | undefined
}) {
  return (
    <ExpandableList
      items={entries}
      getItemId={(entry) => entry.item.id}
      isExpanded={(id) => state.isExpanded(id)}
      isHidden={(id) => state.isHidden(id)}
      // Only ever true in the timeline (the grouped lists carry unread entries),
      // where it is what turns a just-opened entry grey instead of dropping it.
      isRead={(id) => state.isRead(id)}
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
      renderAfter={renderAfter}
      containerClassName={
        // Tagged rows (timeline) put the source name in its own trailing column;
        // untagged rows (grouped) end with the actions.
        showFeedLabel ? `${containerClassName} gm-sp-rss-items-tagged` : containerClassName
      }
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
