import type { Runtime } from '../../runtime'
import type {
  Source,
  SourceComponentProps,
  SourceHeaderProps,
  SourceSettings,
  TabLabel,
} from '../types'
import { SkipRefreshError } from '../errors'
import { createHeaderState, useHeaderState, type HeaderStateStore } from '../header-state'
import { loadCache, saveCache } from '../cache'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { ListIcon, SparklesIcon } from '../shared/icons'
import { XueqiuComponent } from './component'
import { createXueqiuEditor } from './editor'
import { loadFreshXueqiuOptions } from './options'
import { fetchXueqiu } from './fetcher'
import { rankHotPosts } from './scoring/ranking'
import { createXueqiuState, type XueqiuState } from './state'
import { makePruneExpiredCache, pruneItems } from '../shared/prune'
import {
  DEFAULT_RANKING_OPTIONS,
  type XueqiuNewsItem,
  type XueqiuRenderData,
  type XueqiuSourceOptions,
  type ViewMode,
} from './types'

export type XueqiuHandle = {
  mainSource: Source<XueqiuRenderData, 'xueqiu-news'>
  hotSource: Source<XueqiuRenderData, 'xueqiu-hot'>
  state: XueqiuState
  initRuntime(runtime: Runtime): Promise<void>
}

const MAIN_SOURCE_ID = 'xueqiu-news'
const HOT_SOURCE_ID = 'xueqiu-hot'

export function createXueqiuSources(options: XueqiuSourceOptions): XueqiuHandle {
  let currentOptions = options
  const retentionMs = currentOptions.retentionDays * 24 * 60 * 60 * 1000
  const state: XueqiuState = createXueqiuState({ retentionMs })
  const mainHeaderStore = createHeaderState<{
    dateFilter: DateFilter
    viewMode: ViewMode
    filterUnread: boolean
  }>({
    dateFilter: '今',
    viewMode: 'list',
    filterUnread: false,
  })
  const hotHeaderStore = createHeaderState<{ dateFilter: DateFilter; filterUnread: boolean }>({
    dateFilter: '今',
    filterUnread: false,
  })

  const mainSource: Source<XueqiuRenderData, 'xueqiu-news'> = {
    id: MAIN_SOURCE_ID,
    title: '雪球news',
    get ttlMs() {
      return currentOptions.ttlMinutes * 60_000
    },
    groupId: 'browse',
    order: 4,
    getTabLabel(data) {
      return xueqiuNewsTabLabel(data, state)
    },
    RenderHeader: (_props: SourceHeaderProps<XueqiuRenderData>) => {
      const hs = useHeaderState(mainHeaderStore)
      return (
        <DateFilterGroup
          value={hs.dateFilter}
          onChange={(f) => mainHeaderStore.set((s) => ({ ...s, dateFilter: f, viewMode: 'list' }))}
          filterUnread={hs.filterUnread}
          onToggleFilterUnread={() =>
            mainHeaderStore.set((s) => ({ ...s, filterUnread: !s.filterUnread }))
          }
          trailing={
            <span class="gm-sp-date-filter gm-sp-view-toggle">
              <button
                type="button"
                class={`gm-sp-date-filter-btn${hs.viewMode === 'list' ? ' gm-sp-date-filter-btn-active' : ''}`}
                onClick={() => mainHeaderStore.set((s) => ({ ...s, viewMode: 'list' }))}
                title="列表"
              >
                <ListIcon />
              </button>
              <button
                type="button"
                class={`gm-sp-date-filter-btn${hs.viewMode === 'summary' ? ' gm-sp-date-filter-btn-active' : ''}`}
                onClick={() => mainHeaderStore.set((s) => ({ ...s, viewMode: 'summary' }))}
                title="AI 摘要"
              >
                <SparklesIcon />
              </button>
            </span>
          }
        />
      )
    },
    async fetch(runtime, _prevData) {
      currentOptions = await loadFreshXueqiuOptions(runtime, currentOptions)
      const host = runtime.location.hostname
      if (host !== 'xueqiu.com' && !host.endsWith('.xueqiu.com')) {
        // Throw SkipRefreshError so refreshSource skips the cache update
        // entirely. Previously, returning prevData silently marked the data
        // as "fresh" (fetchedAt = now), preventing the xueqiu tab from
        // refreshing. Throwing a regular Error wrote the message to cache
        // even when valid data existed. SkipRefreshError avoids both.
        throw new SkipRefreshError('请访问 xueqiu.com 首页刷新数据')
      }
      await state.loadFromStorage(runtime)
      const fresh = await fetchXueqiu(runtime, currentOptions)
      await saveXueqiuCache(runtime, fresh)
      await pruneExpiredCache(runtime)
      const merged = await loadXueqiuCache(runtime)
      const visible: XueqiuRenderData = {
        news: (merged?.news ?? [])
          .filter((it) => !state.isHidden(String(it.id)))
          .sort((a, b) => b.created_at - a.created_at),
        hotPosts: (merged?.hotPosts ?? []).filter((it) => !state.isHidden(String(it.id))),
      }
      await state.saveToStorage(runtime)
      return visible
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
    },
    RenderComponent: (props) => {
      const hs = useHeaderState(mainHeaderStore)
      return (
        <XueqiuComponent
          {...props}
          state={state}
          mode="news"
          dateFilter={hs.dateFilter}
          filterUnread={hs.filterUnread}
          viewMode={hs.viewMode}
          retentionMs={retentionMs}
          onViewModeChange={(m) => mainHeaderStore.set((s) => ({ ...s, viewMode: m }))}
        />
      )
    },
    createEditor(settings: SourceSettings) {
      return createXueqiuEditor(options, MAIN_SOURCE_ID, settings)
    },
  }

  const hotSource: Source<XueqiuRenderData, 'xueqiu-hot'> = {
    id: HOT_SOURCE_ID,
    title: '雪球热议',
    get ttlMs() {
      return currentOptions.ttlMinutes * 60_000
    },
    groupId: 'browse',
    order: 5,
    getTabLabel() {
      return { label: '雪球热议' }
    },
    RenderHeader: (_props: SourceHeaderProps<XueqiuRenderData>) => {
      const hs = useHeaderState(hotHeaderStore)
      return (
        <DateFilterGroup
          value={hs.dateFilter}
          onChange={(f) => hotHeaderStore.set((s) => ({ ...s, dateFilter: f }))}
          filterUnread={hs.filterUnread}
          onToggleFilterUnread={() =>
            hotHeaderStore.set((s) => ({ ...s, filterUnread: !s.filterUnread }))
          }
        />
      )
    },
    async fetch(runtime, _prevData) {
      currentOptions = await loadFreshXueqiuOptions(runtime, currentOptions)
      // hotPosts live in the shared xueqiu-news cache (single source of truth).
      // Derive + rank here so the fetch→cache→render flow fills the hot cache
      // instead of the old empty payload (which refreshSource stamped fresh).
      await state.loadFromStorage(runtime)
      const cached = await loadXueqiuCache(runtime)
      if (!cached) {
        // Nothing to derive yet — skip so refreshSource leaves the hot cache
        // untouched instead of writing an error + backoff (same semantics as
        // mainSource on a non-xueqiu host).
        throw new SkipRefreshError('请先刷新雪球news获取数据')
      }
      const visible = cached.hotPosts.filter((it) => !state.isHidden(String(it.id)))
      const ranked = rankHotPosts(visible, runtime.now(), DEFAULT_RANKING_OPTIONS)
      return { news: [], hotPosts: ranked }
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
    },
    RenderComponent: (props: SourceComponentProps<XueqiuRenderData>) => (
      <HotRankedView {...props} state={state} hotHeaderStore={hotHeaderStore} />
    ),
    createEditor(settings: SourceSettings) {
      return createXueqiuEditor(options, HOT_SOURCE_ID, settings)
    },
  }

  // Shared prune tail (see shared/prune.ts makePruneExpiredCache). xueqiu
  // intentionally OMITS persistState: its fetch persists state after prune.
  const pruneExpiredCache = makePruneExpiredCache<XueqiuRenderData, string>({
    load: (rt) => loadCache<XueqiuRenderData>(rt, MAIN_SOURCE_ID),
    save: (rt, data, fetchedAt) => saveCache(rt, MAIN_SOURCE_ID, { data, fetchedAt, error: '' }),
    prune: (data, now) => {
      const news = pruneItems({
        items: data.news,
        getId: (it) => String(it.id),
        getCreated: (it) => it.created_at,
        now,
        retentionMs,
      })
      const hot = pruneItems({
        items: data.hotPosts,
        getId: (it) => String(it.id),
        getCreated: (it) => it.created_at,
        now,
        retentionMs,
      })
      const removedIds = [...news.removedIds, ...hot.removedIds]
      return { kept: { news: news.kept, hotPosts: hot.kept }, removedIds }
    },
    removeEntries: (ids) => state.removeEntries(ids),
  })

  return {
    mainSource,
    hotSource,
    state,
    async initRuntime(runtime) {
      await state.loadFromStorage(runtime)
    },
  }
}

function HotRankedView({
  data,
  root,
  runtime,
  onNotify,
  state,
  hotHeaderStore,
}: SourceComponentProps<XueqiuRenderData> & {
  state: XueqiuState
  hotHeaderStore: HeaderStateStore<{ dateFilter: DateFilter; filterUnread: boolean }>
}) {
  const hs = useHeaderState(hotHeaderStore)

  return (
    <XueqiuComponent
      data={data}
      root={root}
      runtime={runtime}
      state={state}
      mode="hot"
      dateFilter={hs.dateFilter}
      filterUnread={hs.filterUnread}
      onNotify={onNotify}
    />
  )
}

async function saveXueqiuCache(runtime: Runtime, data: XueqiuRenderData): Promise<void> {
  const oldCache = await loadXueqiuCache(runtime)
  const merged: XueqiuRenderData = {
    news: mergeItems(oldCache?.news ?? [], data.news),
    hotPosts: mergeItems(oldCache?.hotPosts ?? [], data.hotPosts),
  }
  await saveCache(runtime, MAIN_SOURCE_ID, {
    data: merged,
    fetchedAt: runtime.now(),
    error: '',
  })
}

export function mergeItems(
  oldItems: XueqiuNewsItem[],
  newItems: XueqiuNewsItem[],
): XueqiuNewsItem[] {
  const map = new Map<number, XueqiuNewsItem>()
  for (const item of oldItems) map.set(item.id, item)
  for (const item of newItems) map.set(item.id, item)
  return [...map.values()]
}

async function loadXueqiuCache(runtime: Runtime): Promise<XueqiuRenderData | null> {
  const cached = await loadCache<XueqiuRenderData>(runtime, MAIN_SOURCE_ID)
  return cached?.data ?? null
}

function xueqiuNewsTabLabel(data: XueqiuRenderData | null, state: XueqiuState): TabLabel {
  const news = data?.news ?? []
  const unread = news.filter((it) => !state.isRead(String(it.id))).length
  return { label: '雪球news', badge: unread > 0 ? unread : null }
}
