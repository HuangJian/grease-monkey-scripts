import {
  REDDIT_AUTHOR_TAGS_LS_KEY,
  type AuthorTagMap,
  parseAuthorTagMap,
} from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import type { Source } from '../types'
import { createExpandCollapse } from './expand-collapse'
import { createRedditEditor } from './editor'
import { fetchReddit } from './fetcher'
import { renderReddit } from './render'
import { mergeSubPosts, selectPostsPerSub } from './scoring'
import { createRedditState } from './state'
import type { RedditPost, RedditSourceOptions } from './types'

export type RedditRenderData = Record<string, RedditPost[]>

export function createRedditSource(options: RedditSourceOptions): Source<RedditRenderData> {
  const state = createRedditState()
  const expandCollapse = createExpandCollapse()
  let runtimeRef: Runtime | null = null
  let authorTagMap: AuthorTagMap = {}

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
    async fetch(runtime, _prevData) {
      runtimeRef = runtime
      const fresh = await loadFreshRedditOptions(runtime, options)
      console.debug('[gm-dashboard] reddit.fetch start subs=', fresh.subreddits)
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
      const [fetchResult, history] = await Promise.all([
        fetchReddit(runtime, fresh),
        state.loadHistory(runtime),
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
      const allFetched: RedditPost[] = []
      for (const { posts } of fetchResult.posts) allFetched.push(...posts)
      await state.saveHistory(runtime, allFetched)
      await state.saveToStorage(runtime)
      return visible
    },
    render(container, data, ctx) {
      renderReddit(
        container,
        data,
        state,
        runtimeRef ?? ctx?.runtime ?? null,
        expandCollapse,
        authorTagMap,
      )
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
    },
    createEditor() {
      return createRedditEditor(options)
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
    ageHalfLifeDays:
      typeof raw['ageHalfLifeDays'] === 'number'
        ? (raw['ageHalfLifeDays'] as number)
        : fallback.ageHalfLifeDays,
    subreddits:
      Array.isArray(raw['subreddits']) && (raw['subreddits'] as unknown[]).length > 0
        ? (raw['subreddits'] as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
        : fallback.subreddits,
    minItems: typeof raw['minItems'] === 'number' ? (raw['minItems'] as number) : fallback.minItems,
    minPerSub:
      typeof raw['minPerSub'] === 'number' ? (raw['minPerSub'] as number) : fallback.minPerSub,
    displayRatio:
      typeof raw['displayRatio'] === 'number'
        ? (raw['displayRatio'] as number)
        : fallback.displayRatio,
    elbowDropRatio:
      typeof raw['elbowDropRatio'] === 'number'
        ? (raw['elbowDropRatio'] as number)
        : fallback.elbowDropRatio,
    minCutoffScore:
      typeof raw['minCutoffScore'] === 'number'
        ? (raw['minCutoffScore'] as number)
        : fallback.minCutoffScore,
  }
}

export async function loadFreshRedditOptions(
  runtime: Runtime,
  fallback: RedditSourceOptions,
): Promise<RedditSourceOptions> {
  return loadConfigSection(runtime, 'reddit', fallback, (raw) => coerceRedditOptions(raw, fallback))
}
