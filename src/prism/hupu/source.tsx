import { HUPU_AUTHOR_TAGS_KEY, HUPU_AUTHOR_TAGS_LS_KEY } from '../../shared/author-labels'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
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
import { loadFreshHupuOptions } from './options'
import { mergeBoardPosts, selectPostsPerBoard } from './scoring'
import { createHupuState } from './state'
import { isRetentionExpired } from '../shared-utils'
import { makePruneExpiredCache, pruneGroups } from '../shared/prune'
import type { HupuPost, HupuSourceOptions } from './types'

export type HupuRenderData = Record<string, HupuPost[]>

export function createHupuSource(options: HupuSourceOptions): Source<HupuRenderData, 'hupu'> {
  let currentOptions = options
  const retentionMs = currentOptions.retentionDays * 24 * 60 * 60 * 1000
  const state = createHupuState({ retentionMs })
  const expandCollapse = createExpandCollapse()
  let authorTagMap: AuthorTagMap = {}
  const headerStore = createHeaderState<{ dateFilter: DateFilter; filterUnread: boolean }>({
    dateFilter: '今',
    filterUnread: false,
  })

  async function loadAuthorTags(runtime: Runtime): Promise<void> {
    authorTagMap = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'hupu.com' || h.endsWith('.hupu.com'),
      lsKey: HUPU_AUTHOR_TAGS_LS_KEY,
      gmKey: HUPU_AUTHOR_TAGS_KEY,
    })
  }

  // Shared prune tail (see shared/prune.ts makePruneExpiredCache). The
  // typeof-object guard mirrors the old wrapper: skip malformed cache silently.
  const pruneExpiredCache = makePruneExpiredCache<HupuRenderData, string>({
    load: (rt) => loadCache<HupuRenderData>(rt, 'hupu'),
    save: (rt, data, fetchedAt) => saveCache(rt, 'hupu', { data, fetchedAt, error: '' }),
    prune: (data, now) => {
      if (typeof data !== 'object' || data === null) return { kept: data, removedIds: [] }
      const { kept, removedIds } = pruneGroups(
        data,
        (p) => String(p.id),
        (p) => p.created,
        now,
        retentionMs,
      )
      return { kept, removedIds }
    },
    removeEntries: (ids) => state.removeEntries(ids),
    persistState: (rt) => state.saveToStorage(rt),
  })

  return {
    id: 'hupu',
    title: '虎扑热帖',
    get ttlMs() {
      return currentOptions.ttlMinutes * 60_000
    },
    groupId: 'browse',
    order: 4,
    RenderHeader: (_props: SourceHeaderProps<HupuRenderData>) => {
      const hs = useHeaderState(headerStore)
      return (
        <DateFilterGroup
          value={hs.dateFilter}
          onChange={(f) => headerStore.set((s) => ({ ...s, dateFilter: f }))}
          filterUnread={hs.filterUnread}
          onToggleFilterUnread={() =>
            headerStore.set((s) => ({ ...s, filterUnread: !s.filterUnread }))
          }
        />
      )
    },
    async fetch(runtime, _prevData) {
      currentOptions = await loadFreshHupuOptions(runtime, currentOptions)
      console.debug('[gm-dashboard] hupu.fetch start boards=', currentOptions.boards)
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
      const fetchResult = await fetchHupu(runtime, currentOptions)
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
      const now = runtime.now()
      const selected = selectPostsPerBoard(merged, { ...currentOptions, now })
      // 见 v2ex/source.tsx：refreshSource 用本结果覆盖 pruneExpiredCache 的裁剪快照，
      // 因此过期帖子必须从返回值里剔除，否则缓存永不裁剪、已读状态却被反复清掉。
      const visible: HupuRenderData = {}
      selected.forEach((posts, board) => {
        visible[board] = state.filterVisible(
          posts.filter((p) => !isRetentionExpired(p.created, now, retentionMs)),
        )
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
          filterUnread={hs.filterUnread}
        />
      )
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createHupuEditor(currentOptions, settings)
    },
  }
}
