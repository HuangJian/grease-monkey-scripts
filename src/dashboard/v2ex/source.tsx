import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { V2EX_AUTHOR_TAGS_KEY, V2EX_AUTHOR_TAGS_LS_KEY } from '../../shared/author-labels'
import { syncAuthorTags } from '../author-tags-sync'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { V2exComponent } from './component'
import { createV2exEditor } from './editor'
import { fetchV2ex } from './fetcher'
import { loadCache, saveCache } from '../cache'
import { createV2exState } from './state'
import type { V2exSourceOptions, V2exTopic } from './types'

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  const retentionMs = options.retentionDays * 24 * 60 * 60 * 1000
  const state = createV2exState({ retentionMs })
  let authorTagMap: AuthorTagMap = {}
  const headerState: { dateFilter: DateFilter } = { dateFilter: '全' }

  function isV2exDomain(hostname: string): boolean {
    return hostname === 'v2ex.com' || hostname.endsWith('.v2ex.com')
  }

  async function loadAuthorTags(runtime: Runtime): Promise<void> {
    authorTagMap = await syncAuthorTags({
      runtime,
      isDomain: isV2exDomain,
      lsKey: V2EX_AUTHOR_TAGS_LS_KEY,
      gmKey: V2EX_AUTHOR_TAGS_KEY,
      fallbackGmKey: 'author_tags',
    })
  }

  /**
   * 清理缓存中过期的主题数据。
   * 每次 fetch 后调用，删除 created 时间早于 retentionMs 的条目，
   * 并同步清理对应 state（readAt/hiddenAt/readReplies），避免孤儿 state。
   *
   * 注意：state.ttlMs = retentionMs + 1天，状态比数据多保留 1 天，
   * 防止 fetch 失败时 pruneExpiredCache 未执行导致状态早于数据消失。
   *
   * 存量孤儿 state：此修复前可能已产生了孤儿 state（cache 数据被 prune
   * 但 state 仍在 ttlMs 内未被清理）。这些存量孤儿 state 会在自身 ttlMs
   * 到期后自然清除，不会被读到（因为对应 cache 数据已不存在），影响不大。
   */
  async function pruneExpiredCache(runtime: Runtime): Promise<void> {
    const cached = await loadCache<V2exTopic[]>(runtime, 'v2ex')
    if (!cached?.data || !Array.isArray(cached.data)) return
    const now = Date.now()
    const pruned = cached.data.filter((t) => now - t.created < retentionMs)
    if (pruned.length === cached.data.length) return
    const removedIds = cached.data.filter((t) => now - t.created >= retentionMs).map((t) => t.id)
    if (removedIds.length > 0) {
      state.removeEntries(removedIds)
      await state.saveToStorage(runtime)
    }
    await saveCache(runtime, 'v2ex', {
      data: pruned,
      fetchedAt: cached.fetchedAt,
      error: '',
    })
  }

  return {
    id: 'v2ex',
    title: 'V2EX 热议',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 0,
    headerState,
    RenderHeader: (props: SourceHeaderProps<V2exTopic[]>) => (
      <DateFilterGroup
        value={headerState.dateFilter}
        onChange={(f) => {
          headerState.dateFilter = f
          props.onHeaderChange()
        }}
      />
    ),
    RenderComponent: (props) => (
      <V2exComponent
        {...props}
        state={state}
        authorTagMap={authorTagMap}
        dateFilter={headerState.dateFilter}
      />
    ),
    async fetch(runtime, _prevData) {
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
      const prevById = new Map<number, V2exTopic>()
      if (_prevData) {
        for (const t of _prevData) prevById.set(t.id, t)
      }
      const allTopics = await fetchV2ex(
        runtime,
        {
          todayMinReplies: options.todayMinReplies,
          olderMinReplies: options.olderMinReplies,
          ageHalfLifeDays: options.ageHalfLifeDays,
        },
        new runtime.DOMParser(),
        state,
        prevById,
      )
      const visible = state.filterVisible(allTopics)
      await state.saveToStorage(runtime)
      await pruneExpiredCache(runtime)
      return visible
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createV2exEditor(options, settings)
    },
  }
}
