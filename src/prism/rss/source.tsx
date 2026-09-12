import type { Runtime } from '../../runtime'
import { validateConfig } from '../config'
import { saveConfigSection } from '../editor-helpers'
import type { Source, SourceSettings, TabLabel } from '../types'
import { RssComponent, visibleFeeds } from './component'
import { createRssEditor } from './editor/form'
import { loadFreshOptions } from './editor/helpers'
import { feedId, fetchRssFeeds } from './fetcher'
import { feedSchedule } from './schedule'
import { createRssState, totalUnread, type RssState } from './state'
import type { RssFeed, RssSourceOptions, RssViewMode } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function createRssSource(options: RssSourceOptions): Source<RssFeed[], 'rss'> {
  let currentOptions = options
  let retentionMs = options.retentionDays * DAY_MS
  let state = createRssState({ retentionMs })
  let stateLoaded = false

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
    /**
     * Only a fallback for the card's freshness display: whether a refresh is
     * worth starting is decided by `isDue` below, per feed.
     */
    get ttlMs() {
      return currentOptions.ttlMinutes * 60_000
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
      return (
        <RssComponent
          {...props}
          state={state}
          viewMode={currentOptions.viewMode}
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
