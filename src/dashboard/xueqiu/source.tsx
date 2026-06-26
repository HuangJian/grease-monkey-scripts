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
  const retentionMs = options.retentionDays * 24 * 60 * 60 * 1000
  const state: XueqiuState = createXueqiuState({ retentionMs })
  const mainHeaderState: { dateFilter: DateFilter; viewMode: ViewMode } = {
    dateFilter: '全',
    viewMode: 'list',
  }
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
          props.onHeaderChange()
        }}
        trailing={
          <span class="gm-sp-date-filter gm-sp-view-toggle">
            <button
              type="button"
              class={`gm-sp-date-filter-btn${mainHeaderState.viewMode === 'list' ? ' gm-sp-date-filter-btn-active' : ''}`}
              onClick={() => {
                mainHeaderState.viewMode = 'list'
                props.onHeaderChange()
              }}
            >
              列表
            </button>
            <button
              type="button"
              class={`gm-sp-date-filter-btn${mainHeaderState.viewMode === 'summary' ? ' gm-sp-date-filter-btn-active' : ''}`}
              onClick={() => {
                mainHeaderState.viewMode = 'summary'
                props.onHeaderChange()
              }}
            >
              AI摘要
            </button>
          </span>
        }
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
    RenderComponent: (props) => (
      <XueqiuComponent
        {...props}
        state={state}
        mode="news"
        dateFilter={mainHeaderState.dateFilter}
        viewMode={mainHeaderState.viewMode}
        retentionMs={retentionMs}
        onViewModeChange={(m) => {
          mainHeaderState.viewMode = m
          props.onHeaderChange()
        }}
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
          props.onHeaderChange()
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

  function HotRankedView({
    root,
    runtime,
    onNotify,
    onHeaderChange,
  }: SourceComponentProps<XueqiuRenderData>) {
    const [data, setData] = useState<XueqiuRenderData | null>(null)

    useLayoutEffect(() => {
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
        onHeaderChange={onHeaderChange}
        state={state}
        mode="hot"
        dateFilter={hotHeaderState.dateFilter}
        onNotify={onNotify}
      />
    )
  }

  /**
   * 清理缓存中过期的雪球数据。
   * 每次 fetch 后调用，删除 created_at 时间早于 retentionMs 的条目，
   * 并同步清理对应 state（readAt/hiddenAt/readReplies），避免孤儿 state。
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
    const now = Date.now()
    const removedIds: string[] = []
    const prune = (items: XueqiuNewsItem[]) =>
      items.filter((it) => {
        if (now - it.created_at >= retentionMs) {
          removedIds.push(String(it.id))
          return false
        }
        return true
      })
    const pruned: XueqiuRenderData = {
      news: prune(cached.data.news),
      hotPosts: prune(cached.data.hotPosts),
    }
    if (
      pruned.news.length === cached.data.news.length &&
      pruned.hotPosts.length === cached.data.hotPosts.length
    )
      return
    if (removedIds.length > 0) {
      state.removeEntries(removedIds)
    }
    await saveCache(runtime, MAIN_SOURCE_ID, {
      data: pruned,
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

async function saveXueqiuCache(runtime: Runtime, data: XueqiuRenderData): Promise<void> {
  const oldCache = await loadXueqiuCache(runtime)
  const merged: XueqiuRenderData = {
    news: mergeItems(oldCache?.news ?? [], data.news),
    hotPosts: mergeItems(oldCache?.hotPosts ?? [], data.hotPosts),
  }
  await saveCache(runtime, MAIN_SOURCE_ID, {
    data: merged,
    fetchedAt: Date.now(),
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
