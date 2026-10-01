import type { Runtime } from '../../runtime'
import { validateConfig } from '../config'
import type { DateFilter } from '../date-filter'
import { saveConfigSection } from '../editor-helpers'
import { createHeaderState, useHeaderState } from '../header-state'
import type { Source, SourceSettings, TabLabel } from '../types'
import { RssComponent, visibleFeeds } from './component'
import { createRssEditor } from './editor/form'
import { loadFreshOptions } from './editor/helpers'
import { ALL_DATES, type DateRangePreset } from './date-range'
import { feedId, fetchRssFeeds } from './fetcher'
import { feedSchedule, resolveIntervalMs } from './schedule'
import { createRssState, totalUnread, type RssState } from './state'
import type { RssFeed, RssSourceOptions, RssViewMode } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function createRssSource(options: RssSourceOptions): Source<RssFeed[], 'rss'> {
  let currentOptions = options
  let retentionMs = options.retentionDays * DAY_MS
  let state = createRssState({ retentionMs })
  let stateLoaded = false
  /**
   * `ttlMs` drives the card's 「数据陈旧」 badge, which knows nothing about
   * per-feed intervals. Reporting the **largest** interval in play keeps a daily
   * feed from leaving that badge lit forever; the per-feed truth is in the
   * header hints (`RssComponent`). Falls back to the user minimum before the
   * first fetch, and is recomputed from every result.
   */
  let effectiveMaxIntervalMs = options.ttlMinutes * 60_000
  /**
   * Timeline date filter (全/今/昨/前/早) and the explicit 起–止 window.
   *
   * In-memory, like every other source's filter (v2ex/xueqiu): it narrows a view
   * rather than describing a subscription, so it does not belong in `Config.rss`.
   * Living in a store owned by the source (not in the component) is what makes
   * it survive tab switches and refreshes. 全 by default — this is a reader with
   * 30 days of retention, so hiding older unread entries by default would be a
   * surprising loss of content.
   */
  const headerStore = createHeaderState<{
    dateFilter: DateFilter
    dateRange: DateRangePreset
    filterUnread: boolean
  }>({
    dateFilter: '全',
    dateRange: ALL_DATES,
    filterUnread: false,
  })

  /**
   * The read-state store's TTL is derived from the retention window, but the
   * stored options can change under us (editor save). Rebuild the store when the
   * window moves, so markers never expire before the entries they belong to.
   */
  function ensureState(): RssState {
    const next = currentOptions.retentionDays * DAY_MS
    if (next !== retentionMs) {
      retentionMs = next
      state = createRssState({ retentionMs })
      stateLoaded = false
    }
    return state
  }

  /**
   * Load before the first read or write.
   *
   * `saveToStorage` persists the whole store, so a freshly rebuilt (empty) state
   * would overwrite every persisted marker — changing the retention window in
   * the editor used to wipe all read/hidden state. Requiring both `fetch` and
   * `loadState` to go through here also makes the order of the two irrelevant.
   */
  async function ensureLoaded(runtime: Runtime): Promise<RssState> {
    const active = ensureState()
    if (!stateLoaded) {
      await active.loadFromStorage(runtime)
      stateLoaded = true
    }
    return active
  }

  /** View choice is part of the source options, so it survives a reload. */
  async function persistViewMode(runtimeArg: Runtime, mode: RssViewMode): Promise<void> {
    if (currentOptions.viewMode === mode) return
    currentOptions = { ...currentOptions, viewMode: mode }
    await saveConfigSection({
      runtime: runtimeArg,
      sectionKey: 'rss',
      section: currentOptions,
      validate: validateConfig,
      onError: (message) => console.warn(`[gm-rss] 视图设置保存失败：${message}`),
      onSuccess: () => {},
    })
  }

  return {
    id: 'rss',
    title: 'RSS 阅读',
    // Failures are reported per feed (a ⚠ on the broken block); the aggregated
    // "all feeds failed" paragraph at the top of the card said nothing a reader
    // could act on.
    hideCardError: true,
    /**
     * The largest interval currently in play (see `effectiveMaxIntervalMs`).
     * Only used for the card's freshness badge — whether to refresh at all is
     * decided per feed by `isDue` below.
     */
    get ttlMs() {
      return effectiveMaxIntervalMs
    },
    /**
     * Freshness is per feed, not per source — a single source-level TTL would
     * either poll a daily feed every `ttlMinutes` or starve a busy one.
     *
     * Uses the same `feedSchedule` helper as `fetchRssFeeds`, so the gate that
     * starts a refresh and the gate inside it cannot disagree. `currentOptions`
     * is the in-memory config (refreshed by `fetch`/`loadState`, and re-read by
     * the app on every editor save), which is why this can stay synchronous.
     */
    isDue(cached, now) {
      const byId = new Map(
        ((cached?.data as RssFeed[] | null | undefined) ?? []).map((feed) => [feed.id, feed]),
      )
      return currentOptions.feeds.some(
        (config) =>
          feedSchedule(byId.get(feedId(config.url)), config.enabled !== false, currentOptions, now)
            .due,
      )
    },
    groupId: 'browse',
    order: 6,
    RenderComponent: (props) => {
      // `props.runtime` is read on every render, so the view-toggle callback
      // never needs the source to hold on to a Runtime from an earlier call.
      const viewRuntime = props.runtime
      const headerState = useHeaderState(headerStore)
      return (
        <RssComponent
          {...props}
          state={state}
          viewMode={currentOptions.viewMode}
          dateFilter={headerState.dateFilter}
          onDateFilterChange={(filter) => {
            headerStore.set((prev) => ({ ...prev, dateFilter: filter }))
          }}
          dateRange={headerState.dateRange}
          onDateRangeChange={(range) => {
            headerStore.set((prev) => ({ ...prev, dateRange: range }))
          }}
          filterUnread={headerState.filterUnread}
          onToggleFilterUnread={() => {
            headerStore.set((prev) => ({ ...prev, filterUnread: !prev.filterUnread }))
          }}
          // The source owns the options, so it is the one that can turn a feed
          // into "every N minutes, next in M"; the card stays presentational.
          scheduleHint={(feed, now) =>
            feedSchedule(feed, feed.enabled !== false, currentOptions, now)
          }
          onViewModeChange={(mode) => {
            void persistViewMode(viewRuntime, mode)
          }}
        />
      )
    },
    getTabLabel(data) {
      return rssTabLabel(data, state)
    },
    async fetch(runtimeArg, prevData, fetchOptions) {
      currentOptions = await loadFreshOptions(runtimeArg, currentOptions)
      const activeState = await ensureLoaded(runtimeArg)
      const feeds = await fetchRssFeeds(runtimeArg, currentOptions.feeds, prevData ?? [], {
        maxItemsPerFeed: currentOptions.maxItemsPerFeed,
        retentionMs,
        ttlMinutes: currentOptions.ttlMinutes,
        respectFeedPeriod: currentOptions.respectFeedPeriod,
        // A manual refresh fetches now instead of reporting "nothing due".
        force: fetchOptions?.force === true,
      })
      await activeState.saveToStorage(runtimeArg)
      effectiveMaxIntervalMs = feeds.reduce(
        (max, feed) =>
          Math.max(
            max,
            resolveIntervalMs(
              feed.declaredIntervalMs,
              currentOptions.ttlMinutes,
              currentOptions.respectFeedPeriod,
            ),
          ),
        currentOptions.ttlMinutes * 60_000,
      )
      return feeds
    },
    async loadState(runtimeArg) {
      currentOptions = await loadFreshOptions(runtimeArg, currentOptions)
      await ensureLoaded(runtimeArg)
    },
    createEditor(settings: SourceSettings) {
      return createRssEditor(currentOptions, settings)
    },
  }
}

export function rssTabLabel(data: RssFeed[] | null, state: RssState): TabLabel {
  const unread = totalUnread(visibleFeeds(data ?? []), state)
  return { label: 'RSS 阅读', badge: unread > 0 ? unread : null }
}
