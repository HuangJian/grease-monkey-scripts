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
import { ListIcon, SparklesIcon } from '../card/icons'
import { XueqiuComponent } from './component'
import { createXueqiuEditor } from './editor'
import { loadFreshXueqiuOptions } from './options'
import { fetchXueqiu } from './fetcher'
import { rankHotPosts } from './scoring/ranking'
import { createXueqiuState, type XueqiuState } from './state'
import { pruneItems } from '../shared/prune'
import {
  DEFAULT_RANKING_OPTIONS,
  type XueqiuNewsItem,
  type XueqiuRenderData,
  type XueqiuSourceOptions,
  type ViewMode,
} from './types'

export type XueqiuHandle = {
  mainSource: Source<XueqiuRenderData>
  hotSource: Source<XueqiuRenderData>
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

  const mainSource: Source<XueqiuRenderData> = {
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

  const hotSource: Source<XueqiuRenderData> = {
    id: HOT_SOURCE_ID,
    title: '雪球热议',
    ttlMs: options.ttlMinutes * 60_000,
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

  /**
   * 清理缓存中过期的雪球数据。
   * 每次 fetch 后调用，删除 created_at 时间早于 retentionMs 的条目，
   * 并同步清理对应 state（readAt/hiddenAt/readReplies），避免孤儿 state。
   * created_at 未知（0）的条目永不过期，否则其 state 会在每次刷新时被清掉。
   *
   * 注意：state.ttlMs = retentionMs + 1天，状态比数据多保留 1 天，
   * 防止 fetch 失败时 pruneExpiredCache 未执行导致状态早于数据消失。
   * prune 在 saveToStorage 之前执行，清理 state 后会随后被持久化。
   *
   * 存量孤儿 state：此修复前可能已产生了孤儿 state（cache 数据被 prune
   * 但 state 仍在 ttlMs 内未被清理）。这些存量孤儿 state 会在自身 ttlMs
   * 到期后自然清除，不会被读到（因为对应 cache 数据已不存在），影响不大。
   */
  async function pruneExpiredCache(runtime: Runtime): Promise<void> {
    const cached = await loadCache<XueqiuRenderData>(runtime, MAIN_SOURCE_ID)
    if (!cached?.data) return
    const now = runtime.now()
    const news = pruneItems({
      items: cached.data.news,
      getId: (it) => String(it.id),
      getCreated: (it) => it.created_at,
      now,
      retentionMs,
    })
    const hot = pruneItems({
      items: cached.data.hotPosts,
      getId: (it) => String(it.id),
      getCreated: (it) => it.created_at,
      now,
      retentionMs,
    })
    const removedIds = [...news.removedIds, ...hot.removedIds]
    if (removedIds.length === 0) return
    if (removedIds.length > 0) {
      // NOTE: xueqiu intentionally does NOT saveToStorage here. The caller's
      // fetch persists state after prune (see comment on this function above).
      state.removeEntries(removedIds)
    }
    await saveCache(runtime, MAIN_SOURCE_ID, {
      data: { news: news.kept, hotPosts: hot.kept },
      fetchedAt: cached.fetchedAt,
      error: '',
    })
  }

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
