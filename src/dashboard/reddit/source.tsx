import { REDDIT_AUTHOR_TAGS_KEY, REDDIT_AUTHOR_TAGS_LS_KEY } from '../../shared/author-labels'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { loadCache, saveCache } from '../cache'
import { loadConfigSection } from '../config'
import { syncAuthorTags } from '../author-tags-sync'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { RedditComponent } from './component'
import { createExpandCollapse } from '../expand-collapse'
import { createRedditEditor } from './editor/form'
import { fetchReddit } from './fetcher'
import { mergeSubPosts, selectPostsPerSub } from './scoring'
import { createRedditState } from './state'
import type { RedditPost, RedditSourceOptions } from './types'

export type RedditRenderData = Record<string, RedditPost[]>

export function createRedditSource(options: RedditSourceOptions): Source<RedditRenderData> {
  const retentionMs = options.retentionDays * 24 * 60 * 60 * 1000
  const state = createRedditState({ retentionMs })
  const expandCollapse = createExpandCollapse()
  let authorTagMap: AuthorTagMap = {}
  const headerState: { dateFilter: DateFilter } = { dateFilter: '全' }

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
   * 每次 fetch 后调用，删除 created 时间早于 retentionMs 的条目。
   * 注意：state.ttlMs = retentionMs + 1天，状态比数据多保留 1 天，
   * 防止 fetch 失败时 pruneExpiredCache 未执行导致状态早于数据消失。
   */
  async function pruneExpiredCache(runtime: Runtime): Promise<void> {
    const cached = await loadCache<RedditRenderData>(runtime, 'reddit')
    if (!cached?.data || typeof cached.data !== 'object') return
    const now = Date.now()
    const pruned: RedditRenderData = {}
    let changed = false
    for (const [sub, posts] of Object.entries(cached.data)) {
      const kept = posts.filter((p) => now - p.created < retentionMs)
      if (kept.length !== posts.length) changed = true
      if (kept.length > 0) pruned[sub] = kept
    }
    if (!changed) return
    await saveCache(runtime, 'reddit', {
      data: pruned,
      fetchedAt: cached.fetchedAt,
      error: '',
    })
  }

  return {
    id: 'reddit',
    title: 'Reddit 热帖',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 3,
    headerState,
    RenderHeader: (props: SourceHeaderProps<RedditRenderData>) => (
      <DateFilterGroup
        value={headerState.dateFilter}
        onChange={(f) => {
          headerState.dateFilter = f
          props.onHeaderChange()
        }}
      />
    ),
    async fetch(runtime, _prevData) {
      const fresh = await loadFreshRedditOptions(runtime, options)
      console.debug('[gm-dashboard] reddit.fetch start subs=', fresh.subreddits)
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
      const fetchResult = await fetchReddit(runtime, fresh)
      console.debug(
        '[gm-dashboard] reddit.fetch ok subs=',
        fetchResult.posts.map((p) => p.sub),
        'partial=',
        fetchResult.partialErrors,
      )
      const prevById = new Map<string, RedditPost>()
      if (_prevData) {
        for (const posts of Object.values(_prevData)) {
          for (const p of posts) prevById.set(p.id, p)
        }
      }
      const merged = mergeSubPosts(fetchResult.posts, prevById)
      const now = Date.now()
      const selected = selectPostsPerSub(merged, { ...fresh, now })
      const visible: RedditRenderData = {}
      selected.forEach((posts, sub) => {
        visible[sub] = state.filterVisible(posts)
      })
      await state.saveToStorage(runtime)
      await pruneExpiredCache(runtime)
      return visible
    },
    RenderComponent: (props) => (
      <RedditComponent
        {...props}
        state={state}
        expandCollapse={expandCollapse}
        authorTagMap={authorTagMap}
        dateFilter={headerState.dateFilter}
      />
    ),
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createRedditEditor(options, settings)
    },
  }
}

function coerceRedditOptions(
  raw: Record<string, unknown>,
  fallback: RedditSourceOptions,
): RedditSourceOptions {
  return {
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    retentionDays:
      typeof raw['retentionDays'] === 'number'
        ? (raw['retentionDays'] as number)
        : fallback.retentionDays,
    todayMinComments:
      typeof raw['todayMinComments'] === 'number'
        ? (raw['todayMinComments'] as number)
        : fallback.todayMinComments,
    olderMinComments:
      typeof raw['olderMinComments'] === 'number'
        ? (raw['olderMinComments'] as number)
        : fallback.olderMinComments,
    ageHalfLifeDays:
      typeof raw['ageHalfLifeDays'] === 'number'
        ? (raw['ageHalfLifeDays'] as number)
        : fallback.ageHalfLifeDays,
    subreddits:
      Array.isArray(raw['subreddits']) && (raw['subreddits'] as unknown[]).length > 0
        ? (raw['subreddits'] as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
        : fallback.subreddits,
  }
}

export async function loadFreshRedditOptions(
  runtime: Runtime,
  fallback: RedditSourceOptions,
): Promise<RedditSourceOptions> {
  return loadConfigSection(runtime, 'reddit', fallback, (raw) => coerceRedditOptions(raw, fallback))
}
