import type { Runtime } from '../../runtime'
import type { Source, CachedSource } from '../types'
import { isStale, loadCache, saveCache } from '../cache'
import { releaseLock, tryAcquireLock } from '../lock'

export async function refreshSource(runtime: Runtime, source: Source<unknown>): Promise<void> {
  console.debug('[gm-dashboard] refreshSource enter sourceId=', source.id)
  const acquired = await tryAcquireLock(runtime, source.id)
  if (!acquired) {
    console.debug('[gm-dashboard] refreshSource lock-not-acquired sourceId=', source.id)
    return
  }
  console.debug('[gm-dashboard] refreshSource lock-acquired sourceId=', source.id)
  const oldCache = await loadCache<unknown>(runtime, source.id)
  let next: Omit<CachedSource<unknown>, 'schemaVersion' | 'byteSize'> | null = null
  try {
    const data = await source.fetch(runtime, oldCache?.data)
    next = { data, fetchedAt: Date.now() }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.debug('[gm-dashboard] refreshSource fetch-threw sourceId=', source.id, 'msg=', message)
    next = {
      data: oldCache?.data,
      fetchedAt: oldCache?.fetchedAt ?? Date.now(),
      error: message,
    }
  }
  if (!next) return
  await saveCache(runtime, source.id, next)
  await releaseLock(runtime, source.id)
}

export async function runOpportunisticRefresh(
  runtime: Runtime,
  sources: Source<unknown>[],
  refreshOne: (source: Source<unknown>) => Promise<void>,
): Promise<void> {
  const now = Date.now()
  const stale: Source<unknown>[] = []
  for (const source of sources) {
    const cached = await loadCache<unknown>(runtime, source.id)
    if (isStale(cached, source.ttlMs, now)) {
      stale.push(source)
    }
  }
  await Promise.all(stale.map((s) => refreshOne(s)))
}
