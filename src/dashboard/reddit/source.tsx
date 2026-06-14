import {
  REDDIT_AUTHOR_TAGS_LS_KEY,
  type AuthorTagMap,
  parseAuthorTagMap,
} from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { RedditComponent, RedditDateFilter, type DateFilter } from './component'
import { createExpandCollapse } from './expand-collapse'
import { createRedditEditor } from './editor'
import { fetchReddit } from './fetcher'
import { mergeSubPosts, selectPostsPerSub } from './scoring'
import { createRedditState } from './state'
import type { RedditPost, RedditSourceOptions } from './types'

export type RedditRenderData = Record<string, RedditPost[]>

export function createRedditSource(options: RedditSourceOptions): Source<RedditRenderData> {
  const state = createRedditState()
  const expandCollapse = createExpandCollapse()
  let authorTagMap: AuthorTagMap = {}
  let dateFilter: DateFilter = '全'

  async function syncAuthorTags(runtime: Runtime): Promise<void> {
    try {
      const host = runtime.location.hostname
      const isReddit = host === 'reddit.com' || host.endsWith('.reddit.com')
      if (isReddit) {
        const raw = localStorage.getItem(REDDIT_AUTHOR_TAGS_LS_KEY)
        if (raw) {
          authorTagMap = parseAuthorTagMap(JSON.parse(raw))
          await runtime.setValue(REDDIT_AUTHOR_TAGS_LS_KEY, authorTagMap)
          return
        }
      }
      const stored = await runtime.getValue<unknown>(REDDIT_AUTHOR_TAGS_LS_KEY, null)
      authorTagMap = stored ? parseAuthorTagMap(stored) : {}
    } catch {
      authorTagMap = {}
    }
  }

  return {
    id: 'reddit',
    title: 'Reddit 热帖',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 3,
    headerState: {},
    RenderHeader: (props: SourceHeaderProps<RedditRenderData>) => (
      <RedditDateFilter
        dateFilter={dateFilter}
        onChange={(f) => {
          dateFilter = f
          props.onHeaderChange?.()
        }}
      />
    ),
    async fetch(runtime, _prevData) {
      const fresh = await loadFreshRedditOptions(runtime, options)
      console.debug('[gm-dashboard] reddit.fetch start subs=', fresh.subreddits)
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
      const [fetchResult, history] = await Promise.all([
        fetchReddit(runtime, fresh),
        state.loadHistory(runtime, fresh.historyDays),
      ])
      console.debug(
        '[gm-dashboard] reddit.fetch ok subs=',
        fetchResult.posts.map((p) => p.sub),
        'history=',
        history.length,
        'partial=',
        fetchResult.partialErrors,
      )
      const merged = mergeSubPosts(fetchResult.posts, history)
      const now = Date.now()
      const selected = selectPostsPerSub(merged, { ...fresh, now })
      const visible: RedditRenderData = {}
      for (const [sub, posts] of selected) {
        visible[sub] = state.filterVisible(posts)
      }
      const todayStartMs = new Date(now)
      todayStartMs.setUTCHours(0, 0, 0, 0)
      const todayMs = todayStartMs.getTime()
      const allFetched: RedditPost[] = []
      for (const { posts } of fetchResult.posts) {
        for (const p of posts) {
          if (p.created < todayMs) {
            if (p.numComments >= fresh.olderMinComments) allFetched.push(p)
          } else {
            if (p.numComments >= fresh.todayMinComments) allFetched.push(p)
          }
        }
      }
      await state.saveHistory(runtime, allFetched, fresh.historyDays)
      await state.saveToStorage(runtime)
      return visible
    },
    RenderComponent: ({ data, root, runtime }) => (
      <RedditComponent
        data={data}
        root={root}
        runtime={runtime}
        state={state}
        expandCollapse={expandCollapse}
        authorTagMap={authorTagMap}
        dateFilter={dateFilter}
      />
    ),
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
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
    historyDays:
      typeof raw['historyDays'] === 'number'
        ? (raw['historyDays'] as number)
        : fallback.historyDays,
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
