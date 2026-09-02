import type { Runtime } from '../../runtime'
import { numberOrDefault } from '../../utils'
import { loadConfigSection } from '../config'
import type { RedditSourceOptions } from './types'

function coerceRedditOptions(
  raw: Record<string, unknown>,
  fallback: RedditSourceOptions,
): RedditSourceOptions {
  return {
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    retentionDays: numberOrDefault(raw['retentionDays'], fallback.retentionDays),
    todayMinComments: numberOrDefault(raw['todayMinComments'], fallback.todayMinComments),
    olderMinComments: numberOrDefault(raw['olderMinComments'], fallback.olderMinComments),
    ageHalfLifeDays: numberOrDefault(raw['ageHalfLifeDays'], fallback.ageHalfLifeDays),
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
