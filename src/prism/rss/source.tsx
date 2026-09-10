import type { Runtime } from '../../runtime'
import { validateConfig } from '../config'
import { saveConfigSection } from '../editor-helpers'
import type { Source, SourceSettings, TabLabel } from '../types'
import { RssComponent } from './component'
import { createRssEditor } from './editor/form'
import { loadFreshOptions } from './editor/helpers'
import { fetchRssFeeds } from './fetcher'
import { createRssState, totalUnread, type RssState } from './state'
import type { RssFeed, RssSourceOptions, RssViewMode } from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export function createRssSource(options: RssSourceOptions): Source<RssFeed[], 'rss'> {
  let currentOptions = options
  let retentionMs = options.retentionDays * DAY_MS
  let state = createRssState({ retentionMs })

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
    }
    return state
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
    get ttlMs() {
      return currentOptions.ttlMinutes * 60_000
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
    async fetch(runtimeArg, prevData) {
      currentOptions = await loadFreshOptions(runtimeArg, currentOptions)
      const activeState = ensureState()
      const feeds = await fetchRssFeeds(runtimeArg, currentOptions.feeds, prevData ?? [], {
        maxItemsPerFeed: currentOptions.maxItemsPerFeed,
        retentionMs: currentOptions.retentionDays * DAY_MS,
      })
      await activeState.saveToStorage(runtimeArg)
      return feeds
    },
    async loadState(runtimeArg) {
      currentOptions = await loadFreshOptions(runtimeArg, currentOptions)
      await ensureState().loadFromStorage(runtimeArg)
    },
    createEditor(settings: SourceSettings) {
      return createRssEditor(currentOptions, settings)
    },
  }
}

export function rssTabLabel(data: RssFeed[] | null, state: RssState): TabLabel {
  const unread = totalUnread(data ?? [], state)
  return { label: 'RSS 阅读', badge: unread > 0 ? unread : null }
}
