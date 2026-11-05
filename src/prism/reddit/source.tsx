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
import { refreshMetricsForData, METRICS_REFRESH_DELAY_MS } from './metrics'
import { normalizeSubredditSpec } from './parser'
import { mergeSubPosts, selectPostsPerSub } from './scoring'
import { createRedditState } from './state'
import { isRetentionExpired } from '../shared-utils'
import { makePruneExpiredCache, pruneGroups } from '../shared/prune'
import type { RedditPost, RedditSourceOptions } from './types'

export type RedditRenderData = Record<string, RedditPost[]>

/**
 * Poll cadence for feed rotation: one section per tick, sized so that a full
 * cycle still fits inside `ttlMinutes` (5 sections + 30min → one every 6min).
 *
 * `ttlMs` deliberately stays at the configured value — it also drives the card's
 * 「数据陈旧」 badge, and shrinking it to the per-section interval would flip that
 * badge to stale minutes after every refresh.
 */
function rotationIntervalMs(options: RedditSourceOptions): number {
  const groupCount = Math.max(1, options.subreddits.length)
  // Reddit throttles the feed to roughly one request per minute per IP.
  return Math.max(60_000, (options.ttlMinutes * 60_000) / groupCount)
}

/**
 * `loadState` runs before the panel renders, so refreshing metrics here is what
 * makes every row — including posts captured two or three days ago — show
 * activity as of the moment the user opens the dashboard.
 */
async function refreshCachedMetrics(runtime: Runtime): Promise<void> {
  const cached = await loadCache<RedditRenderData>(runtime, 'reddit')
  if (!cached?.data) return
  const changed = await refreshMetricsForData(runtime, cached.data, runtime.now())
  if (!changed) return
  // The panel's opportunistic refresh is fire-and-forget; if it finished while
  // we were waiting on the archive, its cache (with newer posts) wins.
  const latest = await loadCache<RedditRenderData>(runtime, 'reddit')
  if (!latest || latest.fetchedAt !== cached.fetchedAt) return
  await saveCache(runtime, 'reddit', { ...latest, data: cached.data })
}

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

  let metricsTimerId: number | null = null
  let metricsInFlight = false

  /**
   * View-time metrics refresh, deferred so it never sits on the render path:
   * the panel paints from cache immediately, and the numbers catch up tens of
   * seconds later. The resulting cache write fires the dashboard's
   * `addValueChangeListener` for this source, which repaints the group.
   *
   * Repeated `loadState` calls (the idle bootstrap and opening the panel) share
   * one pending timer instead of stacking requests.
   */
  function scheduleMetricsRefresh(runtime: Runtime): void {
    if (metricsTimerId !== null || metricsInFlight) return
    metricsTimerId = runtime.setTimeout(() => {
      metricsTimerId = null
      metricsInFlight = true
      void refreshCachedMetrics(runtime).finally(() => {
        metricsInFlight = false
      })
    }, METRICS_REFRESH_DELAY_MS)
  }

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
    // `isDue` wins over `ttlMs` in the refresh scheduler: each tick covers one
    // section, so the source is polled every ttl/K rather than every ttl.
    isDue(cached, now) {
      if (!cached) return true
      return now - cached.fetchedAt >= rotationIntervalMs(currentOptions)
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
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)

      // 100 posts is the feed's hard cap and every member of one request shares
      // it, so one request per section is the only way a quiet subreddit gets its
      // full share. Sections skipped this round keep their cached posts; the next
      // refresh covers the next one (see reddit-feed-rotation.plan.md).
      const specs = currentOptions.subreddits
        .map(normalizeSubredditSpec)
        .filter((s) => s.length > 0)
      const groupCount = Math.max(1, specs.length)
      const groupIndex = await state.currentGroup(runtime, groupCount)
      const target = specs[groupIndex] === undefined ? [] : [specs[groupIndex]!]
      console.debug('[gm-dashboard] reddit group', groupIndex + 1, '/', groupCount, target)

      const fetchResult = await fetchReddit(runtime, { ...currentOptions, subreddits: target })
      // Advance only after the request succeeded: a failed round retries the same
      // section instead of skipping it for a full cycle.
      await state.advanceGroup(runtime, groupCount)
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
      // 未抓取的 section 以空 live 进 mergeSubPosts：分组键取自缓存，prev 条目会按
      // 原 sub 回填（hupu 的教训：归属只认分组键，别从条目反推）。
      const fetched = new Set(fetchResult.posts.map((p) => p.sub))
      const live: Array<{ sub: string; posts: RedditPost[] }> = [...fetchResult.posts]
      specs
        .filter((spec) => !fetched.has(spec))
        .forEach((spec) => live.push({ sub: spec, posts: [] }))
      const merged = mergeSubPosts(live, prevById)
      const now = runtime.now()
      const selected = selectPostsPerSub(merged, { ...currentOptions, now }, true)
      // 见 v2ex/source.tsx：refreshSource 用本结果覆盖 pruneExpiredCache 的裁剪快照，
      // 因此过期帖子必须从返回值里剔除，否则缓存永不裁剪、已读状态却被反复清掉。
      const visible: RedditRenderData = {}
      selected.forEach((posts, sub) => {
        const kept = state.filterVisible(
          posts.filter((p) => !isRetentionExpired(p.created, now, retentionMs)),
        )
        // 未抓且无缓存的分区不写空数组，否则 UI 会为它渲染一个空 section。
        if (kept.length > 0 || fetched.has(sub)) visible[sub] = kept
      })
      await state.saveToStorage(runtime)
      await pruneExpiredCache(runtime)
      // Refresh the numbers on the whole visible set (new posts + cached
      // history), so a panel left open also keeps showing current activity.
      await refreshMetricsForData(runtime, visible, now)
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
      // Deliberately not awaited: metrics must never delay the first paint.
      scheduleMetricsRefresh(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createRedditEditor(currentOptions, settings)
    },
  }
}
