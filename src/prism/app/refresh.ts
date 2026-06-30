import type { Runtime } from '../../runtime'
import type { Source, CachedSource } from '../types'
import { BACKOFF_DELAYS_MS } from '../types'
import { isInBackoff, isStale, loadCache, saveCache } from '../cache'
import { releaseLock, tryAcquireLock } from '../lock'
import { SkipRefreshError } from '../errors'

/** Returns the backoff delay for the given consecutive failure count (1-based). */
export function computeBackoffMs(failureCount: number): number {
  if (failureCount <= 0) return 0
  const idx = Math.min(failureCount - 1, BACKOFF_DELAYS_MS.length - 1)
  return BACKOFF_DELAYS_MS[idx]!
}

export async function refreshSource(runtime: Runtime, source: Source<unknown>): Promise<void> {
  console.debug('[gm-dashboard] refreshSource enter sourceId=', source.id)
  const token = await tryAcquireLock(runtime, source.id)
  if (!token) {
    console.debug('[gm-dashboard] refreshSource lock-not-acquired sourceId=', source.id)
    return
  }
  try {
    const oldCache = await loadCache<unknown>(runtime, source.id)
    let next: Omit<CachedSource<unknown>, 'schemaVersion'> | null = null
    try {
      const data = await source.fetch(runtime, oldCache?.data)
      next = { data, fetchedAt: Date.now(), error: '' }
    } catch (e) {
      if (e instanceof SkipRefreshError) {
        // Source cannot fetch on this host (e.g. xueqiu on github.com).
        // Skip cache update entirely — don't steal the refresh, don't
        // overwrite fetchedAt, don't write an error. Just release the
        // lock so a tab on the correct host can acquire it.
        console.debug('[gm-dashboard] refreshSource skip sourceId=', source.id, 'msg=', e.message)
        return
      }
      const message = e instanceof Error ? e.message : String(e)
      console.debug(
        '[gm-dashboard] refreshSource fetch-threw sourceId=',
        source.id,
        'msg=',
        message,
      )
      const failureCount = (oldCache?.failureCount ?? 0) + 1
      next = {
        data: oldCache?.data,
        fetchedAt: oldCache?.fetchedAt ?? Date.now(),
        error: message,
        attemptedAt: Date.now(),
        failureCount,
        nextRetryAt: Date.now() + computeBackoffMs(failureCount),
      }
    }
    if (next) {
      await saveCache(runtime, source.id, next)
    }
  } finally {
    await releaseLock(runtime, source.id, token)
  }
}

export async function runOpportunisticRefresh(
  runtime: Runtime,
  sources: Source<unknown>[],
  refreshOne: (source: Source<unknown>) => Promise<void>,
): Promise<void> {
  const now = Date.now()
  const stale = (
    await Promise.all(
      sources.map(async (source) => {
        const cached = await loadCache<unknown>(runtime, source.id)
        if (!isStale(cached, source.ttlMs, now)) return null
        if (isInBackoff(cached, now)) {
          console.debug(
            '[gm-dashboard] runOpportunisticRefresh backoff-skip sourceId=',
            source.id,
            'nextRetryAt=',
            cached!.nextRetryAt,
          )
          return null
        }
        return source
      }),
    )
  ).filter((s): s is Source<unknown> => s !== null)
  await Promise.all(stale.map((s) => refreshOne(s)))
}
