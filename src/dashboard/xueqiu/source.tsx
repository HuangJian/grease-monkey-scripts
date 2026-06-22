import { useState, useLayoutEffect } from 'preact/hooks'
import type { Runtime } from '../../runtime'
import type {
  Source,
  SourceComponentProps,
  SourceHeaderProps,
  SourceSettings,
  TabLabel,
} from '../types'
import { loadCache, saveCache } from '../cache'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { XueqiuComponent } from './component'
import { createXueqiuEditor } from './editor'
import { fetchXueqiu } from './fetcher'
import { rankHotPosts } from './scoring/ranking'
import { createXueqiuState, type XueqiuState } from './state'
import {
  DEFAULT_RANKING_OPTIONS,
  type XueqiuNewsItem,
  type XueqiuRenderData,
  type XueqiuSourceOptions,
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
  const retentionMs = options.retentionDays * 24 * 60 * 60 * 1000
  const state: XueqiuState = createXueqiuState({ retentionMs })
  const mainHeaderState: { dateFilter: DateFilter } = { dateFilter: '全' }
  const hotHeaderState: { dateFilter: DateFilter } = { dateFilter: '全' }

  const mainSource: Source<XueqiuRenderData> = {
    id: MAIN_SOURCE_ID,
    title: '雪球news',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 4,
    headerState: mainHeaderState,
    getTabLabel(data) {
      return xueqiuNewsTabLabel(data, state)
    },
    RenderHeader: (props: SourceHeaderProps<XueqiuRenderData>) => (
      <DateFilterGroup
        value={mainHeaderState.dateFilter}
        onChange={(f) => {
          mainHeaderState.dateFilter = f
          props.onHeaderChange?.()
        }}
      />
    ),
    async fetch(runtime) {
      await state.loadFromStorage(runtime)
      const fresh = await fetchXueqiu(runtime, options)
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
    RenderComponent: ({ data, root, runtime }) => (
      <XueqiuComponent
        data={data}
        root={root}
        runtime={runtime}
        state={state}
        mode="news"
        dateFilter={mainHeaderState.dateFilter}
      />
    ),
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
    headerState: hotHeaderState,
    getTabLabel() {
      return { label: '雪球热议' }
    },
    RenderHeader: (props: SourceHeaderProps<XueqiuRenderData>) => (
      <DateFilterGroup
        value={hotHeaderState.dateFilter}
        onChange={(f) => {
          hotHeaderState.dateFilter = f
          props.onHeaderChange?.()
        }}
      />
    ),
    async fetch(runtime) {
      // HotPosts are persisted only under MAIN_SOURCE_ID to avoid duplication.
      // This source returns empty data — RenderComponent loads from shared cache.
      await state.loadFromStorage(runtime)
      const cached = await loadXueqiuCache(runtime)
      if (!cached) {
        throw new Error('请先刷新雪球news获取数据')
      }
      return { news: [], hotPosts: [] }
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
    },
    RenderComponent: (props: SourceComponentProps<XueqiuRenderData>) => (
      <HotRankedView {...props} />
    ),
    createEditor(settings: SourceSettings) {
      return createXueqiuEditor(options, HOT_SOURCE_ID, settings)
    },
  }

  function HotRankedView({ root, runtime, onNotify }: SourceComponentProps<XueqiuRenderData>) {
    const [data, setData] = useState<XueqiuRenderData | null>(null)

    useLayoutEffect(() => {
      if (!runtime) return
      loadCache<XueqiuRenderData>(runtime, MAIN_SOURCE_ID).then((cached) => {
        if (!cached?.data) {
          setData({ news: [], hotPosts: [] })
          return
        }
        const filtered = cached.data.hotPosts.filter((it) => !state.isHidden(String(it.id)))
        const ranked = rankHotPosts(filtered, Date.now(), DEFAULT_RANKING_OPTIONS)
        setData({ news: [], hotPosts: ranked })
      })
    }, [runtime])

    return (
      <XueqiuComponent
        data={data}
        root={root}
        runtime={runtime}
        state={state}
        mode="hot"
        dateFilter={hotHeaderState.dateFilter}
        onNotify={onNotify}
      />
    )
  }

  /**
   * 清理缓存中过期的雪球数据。
   * 每次 fetch 后调用，删除 created_at 时间早于 retentionMs 的条目。
   * 注意：state.ttlMs = retentionMs + 1天，状态比数据多保留 1 天，
   * 防止 fetch 失败时 pruneExpiredCache 未执行导致状态早于数据消失。
   */
  async function pruneExpiredCache(runtime: Runtime): Promise<void> {
    const cached = await loadCache<XueqiuRenderData>(runtime, MAIN_SOURCE_ID)
    if (!cached?.data) return
    const now = Date.now()
    const prune = (items: XueqiuNewsItem[]) =>
      items.filter((it) => now - it.created_at < retentionMs)
    const pruned: XueqiuRenderData = {
      news: prune(cached.data.news),
      hotPosts: prune(cached.data.hotPosts),
    }
    if (
      pruned.news.length === cached.data.news.length &&
      pruned.hotPosts.length === cached.data.hotPosts.length
    )
      return
    await saveCache(runtime, MAIN_SOURCE_ID, {
      data: pruned,
      fetchedAt: cached.fetchedAt,
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

async function saveXueqiuCache(runtime: Runtime, data: XueqiuRenderData): Promise<void> {
  const oldCache = await loadXueqiuCache(runtime)
  const merged: XueqiuRenderData = {
    news: mergeItems(oldCache?.news ?? [], data.news),
    hotPosts: mergeItems(oldCache?.hotPosts ?? [], data.hotPosts),
  }
  await saveCache(runtime, MAIN_SOURCE_ID, {
    data: merged,
    fetchedAt: Date.now(),
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
