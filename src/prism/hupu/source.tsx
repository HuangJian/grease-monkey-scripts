import { HUPU_AUTHOR_TAGS_KEY, HUPU_AUTHOR_TAGS_LS_KEY } from '../../shared/author-labels'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import { syncAuthorTags } from '../author-tags-sync'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { createHeaderState, useHeaderState } from '../header-state'
import { loadCache, saveCache } from '../cache'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { HupuComponent } from './component'
import { createExpandCollapse } from '../expand-collapse'
import { createHupuEditor } from './editor/form'
import { fetchHupu } from './fetcher'
import { mergeBoardPosts, selectPostsPerBoard } from './scoring'
import { createHupuState } from './state'
import type { HupuPost, HupuSourceOptions } from './types'

export type HupuRenderData = Record<string, HupuPost[]>

export function createHupuSource(options: HupuSourceOptions): Source<HupuRenderData> {
  const retentionMs = options.retentionDays * 24 * 60 * 60 * 1000
  const state = createHupuState({ retentionMs })
  const expandCollapse = createExpandCollapse()
  let authorTagMap: AuthorTagMap = {}
  const headerStore = createHeaderState<{ dateFilter: DateFilter }>({ dateFilter: '今' })

  async function loadAuthorTags(runtime: Runtime): Promise<void> {
    authorTagMap = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'hupu.com' || h.endsWith('.hupu.com'),
      lsKey: HUPU_AUTHOR_TAGS_LS_KEY,
      gmKey: HUPU_AUTHOR_TAGS_KEY,
    })
  }

  /**
   * 清理缓存中过期的帖子数据。
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
    const cached = await loadCache<HupuRenderData>(runtime, 'hupu')
    if (!cached?.data || typeof cached.data !== 'object') return
    const now = Date.now()
    const pruned: HupuRenderData = {}
    let changed = false
    const removedIds: string[] = []
    for (const [board, posts] of Object.entries(cached.data)) {
      const kept = posts.filter((p) => now - p.created < retentionMs)
      if (kept.length !== posts.length) {
        changed = true
        posts.filter((p) => now - p.created >= retentionMs).forEach((p) => removedIds.push(p.id))
      }
      if (kept.length > 0) pruned[board] = kept
    }
    if (!changed) return
    if (removedIds.length > 0) {
      state.removeEntries(removedIds)
      await state.saveToStorage(runtime)
    }
    await saveCache(runtime, 'hupu', {
      data: pruned,
      fetchedAt: cached.fetchedAt,
      error: '',
    })
  }

  return {
    id: 'hupu',
    title: '虎扑热帖',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 4,
    RenderHeader: (_props: SourceHeaderProps<HupuRenderData>) => {
      const hs = useHeaderState(headerStore)
      return (
        <DateFilterGroup
          value={hs.dateFilter}
          onChange={(f) => headerStore.set((s) => ({ ...s, dateFilter: f }))}
        />
      )
    },
    async fetch(runtime, _prevData) {
      const fresh = await loadFreshHupuOptions(runtime, options)
      console.debug('[gm-dashboard] hupu.fetch start boards=', fresh.boards)
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
      const fetchResult = await fetchHupu(runtime, fresh)
      console.debug(
        '[gm-dashboard] hupu.fetch ok boards=',
        fetchResult.boards.map((p) => p.board),
        'partial=',
        fetchResult.partialErrors,
      )
      const prevById = new Map<string, HupuPost>()
      if (_prevData) {
        for (const posts of Object.values(_prevData)) {
          for (const p of posts) prevById.set(p.id, p)
        }
      }
      const merged = mergeBoardPosts(fetchResult.boards, prevById)
      const now = Date.now()
      const selected = selectPostsPerBoard(merged, { ...fresh, now })
      const visible: HupuRenderData = {}
      selected.forEach((posts, board) => {
        visible[board] = state.filterVisible(posts)
      })
      await state.saveToStorage(runtime)
      await pruneExpiredCache(runtime)
      return visible
    },
    RenderComponent: (props) => {
      const hs = useHeaderState(headerStore)
      return (
        <HupuComponent
          {...props}
          state={state}
          expandCollapse={expandCollapse}
          authorTagMap={authorTagMap}
          dateFilter={hs.dateFilter}
        />
      )
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createHupuEditor(options, settings)
    },
  }
}

function coerceHupuOptions(
  raw: Record<string, unknown>,
  fallback: HupuSourceOptions,
): HupuSourceOptions {
  return {
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    boards:
      Array.isArray(raw['boards']) && (raw['boards'] as unknown[]).length > 0
        ? (raw['boards'] as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
        : fallback.boards,
    retentionDays:
      typeof raw['retentionDays'] === 'number'
        ? (raw['retentionDays'] as number)
        : fallback.retentionDays,
    todayMinReplies:
      typeof raw['todayMinReplies'] === 'number'
        ? (raw['todayMinReplies'] as number)
        : fallback.todayMinReplies,
    olderMinReplies:
      typeof raw['olderMinReplies'] === 'number'
        ? (raw['olderMinReplies'] as number)
        : fallback.olderMinReplies,
    ageHalfLifeDays:
      typeof raw['ageHalfLifeDays'] === 'number'
        ? (raw['ageHalfLifeDays'] as number)
        : fallback.ageHalfLifeDays,
    lightsWeight:
      typeof raw['lightsWeight'] === 'number'
        ? (raw['lightsWeight'] as number)
        : fallback.lightsWeight,
    repliesWeight:
      typeof raw['repliesWeight'] === 'number'
        ? (raw['repliesWeight'] as number)
        : fallback.repliesWeight,
  }
}

export async function loadFreshHupuOptions(
  runtime: Runtime,
  fallback: HupuSourceOptions,
): Promise<HupuSourceOptions> {
  return loadConfigSection(runtime, 'hupu', fallback, (raw) => coerceHupuOptions(raw, fallback))
}
