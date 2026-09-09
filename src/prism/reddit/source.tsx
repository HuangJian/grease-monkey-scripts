import { REDDIT_AUTHOR_TAGS_KEY, REDDIT_AUTHOR_TAGS_LS_KEY } from '../../shared/author-labels'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { createHeaderState, useHeaderState } from '../header-state'
import { loadCache, saveCache } from '../cache'
import { syncAuthorTags } from '../author-tags-sync'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { RedditComponent } from './component'
import { createExpandCollapse } from '../expand-collapse'
import { createRedditEditor } from './editor/form'
import { fetchReddit } from './fetcher'
import { loadFreshRedditOptions } from './options'
import { mergeSubPosts, selectPostsPerSub } from './scoring'
import { createRedditState } from './state'
import { isRetentionExpired } from '../shared-utils'
import { makePruneExpiredCache, pruneGroups } from '../shared/prune'
import type { RedditPost, RedditSourceOptions } from './types'

export type RedditRenderData = Record<string, RedditPost[]>

export function createRedditSource(
  options: RedditSourceOptions,
): Source<RedditRenderData, 'reddit'> {
  let currentOptions = options
  const retentionMs = currentOptions.retentionDays * 24 * 60 * 60 * 1000
  const state = createRedditState({ retentionMs })
  const expandCollapse = createExpandCollapse()
  let authorTagMap: AuthorTagMap = {}
  const headerStore = createHeaderState<{ dateFilter: DateFilter; filterUnread: boolean }>({
    dateFilter: '今',
    filterUnread: false,
  })

  async function loadAuthorTags(runtime: Runtime): Promise<void> {
    authorTagMap = await syncAuthorTags({
      runtime,
      isDomain: (h) => h === 'reddit.com' || h.endsWith('.reddit.com'),
      lsKey: REDDIT_AUTHOR_TAGS_LS_KEY,
      gmKey: REDDIT_AUTHOR_TAGS_KEY,
    })
  }

  // Shared prune tail (see shared/prune.ts makePruneExpiredCache). The
  // typeof-object guard mirrors the old wrapper: skip malformed cache silently.
  const pruneExpiredCache = makePruneExpiredCache<RedditRenderData, string>({
    load: (rt) => loadCache<RedditRenderData>(rt, 'reddit'),
    save: (rt, data, fetchedAt) => saveCache(rt, 'reddit', { data, fetchedAt, error: '' }),
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
    id: 'reddit',
    title: 'Reddit 热帖',
    get ttlMs() {
      return currentOptions.ttlMinutes * 60_000
    },
    groupId: 'browse',
    order: 3,
    RenderHeader: (_props: SourceHeaderProps<RedditRenderData>) => {
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
      currentOptions = await loadFreshRedditOptions(runtime, currentOptions)
      console.debug('[gm-dashboard] reddit.fetch start subs=', currentOptions.subreddits)
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
      const fetchResult = await fetchReddit(runtime, currentOptions)
      console.debug(
        '[gm-dashboard] reddit.fetch ok subs=',
        fetchResult.posts.map((p) => p.sub),
        'partial=',
        fetchResult.partialErrors,
      )
      const prevById = new Map<string, { sub: string; post: RedditPost }>()
      if (_prevData) {
        for (const [sub, posts] of Object.entries(_prevData)) {
          for (const p of posts) prevById.set(p.id, { sub, post: p })
        }
      }
      const merged = mergeSubPosts(fetchResult.posts, prevById)
      const now = runtime.now()
      const selected = selectPostsPerSub(merged, { ...currentOptions, now })
      // 见 v2ex/source.tsx：refreshSource 用本结果覆盖 pruneExpiredCache 的裁剪快照，
      // 因此过期帖子必须从返回值里剔除，否则缓存永不裁剪、已读状态却被反复清掉。
      const visible: RedditRenderData = {}
      selected.forEach((posts, sub) => {
        visible[sub] = state.filterVisible(
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
        <RedditComponent
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
      return createRedditEditor(currentOptions, settings)
    },
  }
}
