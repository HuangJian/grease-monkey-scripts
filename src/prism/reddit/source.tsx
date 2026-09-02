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
import { pruneGroups } from '../shared/prune'
import type { RedditPost, RedditSourceOptions } from './types'

export type RedditRenderData = Record<string, RedditPost[]>

export function createRedditSource(options: RedditSourceOptions): Source<RedditRenderData> {
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

  /**
   * 清理缓存中过期的帖子数据。
   * 每次 fetch 后调用，删除 created 时间早于 retentionMs 的条目，
   * 并同步清理对应 state（readAt/hiddenAt/readReplies），避免孤儿 state。
   * created 未知（0）的条目永不过期，否则其 state 会在每次刷新时被清掉。
   *
   * 注意：state.ttlMs = retentionMs + 1天，状态比数据多保留 1 天，
   * 防止 fetch 失败时 pruneExpiredCache 未执行导致状态早于数据消失。
   *
   * 存量孤儿 state：此修复前可能已产生了孤儿 state（cache 数据被 prune
   * 但 state 仍在 ttlMs 内未被清理）。这些存量孤儿 state 会在自身 ttlMs
   * 到期后自然清除，不会被读到（因为对应 cache 数据已不存在），影响不大。
   */
  async function pruneExpiredCache(runtime: Runtime): Promise<void> {
    const cached = await loadCache<RedditRenderData>(runtime, 'reddit')
    if (!cached?.data || typeof cached.data !== 'object') return
    const now = Date.now()
    const { kept, removedIds, changed } = pruneGroups(
      cached.data,
      (p) => String(p.id),
      (p) => p.created,
      now,
      retentionMs,
    )
    if (!changed) return
    if (removedIds.length > 0) {
      state.removeEntries(removedIds)
      await state.saveToStorage(runtime)
    }
    await saveCache(runtime, 'reddit', {
      data: kept,
      fetchedAt: cached.fetchedAt,
      error: '',
    })
  }

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
      const now = Date.now()
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
