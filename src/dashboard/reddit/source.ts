import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import type { Source } from '../types'
import { createRedditEditor } from './editor'
import { fetchReddit } from './fetcher'
import { renderReddit } from './render'
import { createRedditState } from './state'
import type { RedditPost, RedditSourceOptions } from './types'

export function createRedditSource(options: RedditSourceOptions): Source<RedditPost[]> {
  const state = createRedditState()
  return {
    id: 'reddit',
    title: 'Reddit 热帖',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 2,
    async fetch(runtime, _prevData) {
      const fresh = await loadFreshRedditOptions(runtime, options)
      console.debug('[gm-dashboard] reddit.fetch start subs=', fresh.subreddits)
      await state.loadFromStorage(runtime)
      const result = await fetchReddit(runtime, fresh)
      console.debug(
        '[gm-dashboard] reddit.fetch ok posts=',
        result.posts.length,
        'partial=',
        result.partialErrors,
      )
      const visible = state.filterVisible(result.posts)
      await state.saveToStorage(runtime)
      return visible
    },
    render(container, data) {
      renderReddit(container, data, state)
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
    subreddits:
      Array.isArray(raw['subreddits']) && (raw['subreddits'] as unknown[]).length > 0
        ? (raw['subreddits'] as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
        : fallback.subreddits,
    minItems: typeof raw['minItems'] === 'number' ? (raw['minItems'] as number) : fallback.minItems,
    maxItems: typeof raw['maxItems'] === 'number' ? (raw['maxItems'] as number) : fallback.maxItems,
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

export { clearRedditTopicState } from './state'
export { normalizeSubredditName, parseRedditListing } from './parser'
export { dynamicRedditCount, mergeRedditPosts } from './scoring'
export { fetchReddit } from './fetcher'
export type {
  RedditCountOptions,
  RedditFetchResult,
  RedditPost,
  RedditSourceOptions,
} from './types'
