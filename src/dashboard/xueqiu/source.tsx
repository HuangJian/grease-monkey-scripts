import type { Runtime } from '../../runtime'
import type { Source, SourceHeaderProps, SourceSettings, TabLabel } from '../types'
import { loadCache } from '../cache'
import { XueqiuComponent, XueqiuDateFilter, applyDateFilter, type DateFilter } from './component'
import { createXueqiuEditor } from './editor'
import { fetchXueqiu } from './fetcher'
import { rankHotPosts } from './scoring'
import { createXueqiuState, type XueqiuState } from './state'
import { DEFAULT_RANKING_OPTIONS, type XueqiuRenderData, type XueqiuSourceOptions } from './types'

export type XueqiuHandle = {
  mainSource: Source<XueqiuRenderData>
  hotSource: Source<XueqiuRenderData>
  state: XueqiuState
  initRuntime(runtime: Runtime): Promise<void>
}

const MAIN_SOURCE_ID = 'xueqiu-news'
const HOT_SOURCE_ID = 'xueqiu-hot'

export function createXueqiuSources(options: XueqiuSourceOptions): XueqiuHandle {
  const state: XueqiuState = createXueqiuState()
  let mainDateFilter: DateFilter = '全'
  let hotDateFilter: DateFilter = '全'

  const mainSource: Source<XueqiuRenderData> = {
    id: MAIN_SOURCE_ID,
    title: '雪球news',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 4,
    headerState: {},
    getTabLabel(data) {
      return xueqiuNewsTabLabel(data, state)
    },
    RenderHeader: (props: SourceHeaderProps<XueqiuRenderData>) => (
      <XueqiuDateFilter
        dateFilter={mainDateFilter}
        onChange={(f) => {
          mainDateFilter = f
          props.onHeaderChange?.()
        }}
        onMarkAllRead={() => {
          const items = props.data?.news ?? []
          const dateFiltered = applyDateFilter(items, mainDateFilter)
          const visible =
            mainDateFilter === '未'
              ? dateFiltered.filter(
                  (it) => !state.isHidden(String(it.id)) && !state.isRead(String(it.id)),
                )
              : state.filterVisible(dateFiltered)
          for (const item of visible) {
            state.markRead(String(item.id))
          }
          void state.saveToStorage(props.runtime)
          props.onHeaderChange?.()
        }}
      />
    ),
    async fetch(runtime) {
      await state.loadFromStorage(runtime)
      const fresh = await fetchXueqiu(runtime, options)
      await saveXueqiuCache(runtime, fresh)
      const visible: XueqiuRenderData = {
        news: fresh.news.filter((it) => !state.isHidden(String(it.id))),
        hotPosts: fresh.hotPosts.filter((it) => !state.isHidden(String(it.id))),
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
        dateFilter={mainDateFilter}
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
    headerState: {},
    getTabLabel() {
      return { label: '雪球热议' }
    },
    RenderHeader: (props: SourceHeaderProps<XueqiuRenderData>) => (
      <XueqiuDateFilter
        dateFilter={hotDateFilter}
        onChange={(f) => {
          hotDateFilter = f
          props.onHeaderChange?.()
        }}
        onMarkAllRead={() => {
          const items = props.data?.hotPosts ?? []
          const dateFiltered = applyDateFilter(items, hotDateFilter)
          const visible =
            hotDateFilter === '未'
              ? dateFiltered.filter(
                  (it) => !state.isHidden(String(it.id)) && !state.isRead(String(it.id)),
                )
              : state.filterVisible(dateFiltered)
          for (const item of visible) {
            state.markRead(String(item.id))
          }
          void state.saveToStorage(props.runtime)
          props.onHeaderChange?.()
        }}
      />
    ),
    async fetch(runtime) {
      await state.loadFromStorage(runtime)
      const cached = await loadXueqiuCache(runtime)
      if (!cached) {
        throw new Error('请先刷新雪球news获取数据')
      }
      const hiddenFiltered = cached.hotPosts.filter((it) => !state.isHidden(String(it.id)))
      const ranked = rankHotPosts(hiddenFiltered, Date.now(), DEFAULT_RANKING_OPTIONS)
      const visible: XueqiuRenderData = {
        news: [],
        hotPosts: ranked,
      }
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
        mode="hot"
        dateFilter={hotDateFilter}
      />
    ),
    createEditor(settings: SourceSettings) {
      return createXueqiuEditor(options, HOT_SOURCE_ID, settings)
    },
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
  const { saveCache } = await import('../cache')
  await saveCache(runtime, MAIN_SOURCE_ID, {
    data,
    fetchedAt: Date.now(),
  })
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
