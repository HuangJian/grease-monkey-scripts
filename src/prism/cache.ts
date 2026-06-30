import type { Runtime } from '../runtime'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, VERY_STALE_MULTIPLIER, type CachedSource } from './types'
import { compressForStorage, expandFromStorage } from './codec'

function stripNulls<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) => v ?? undefined))
}

export async function loadCache<T>(
  runtime: Runtime,
  sourceId: string,
): Promise<CachedSource<T> | null> {
  const value = await runtime.getValue<CachedSource<T> | null>(CACHE_KEY(sourceId), null)
  if (!value || typeof value.fetchedAt !== 'number') return null
  if (value.schemaVersion !== CACHE_SCHEMA_VERSION) return null
  return expandFromStorage(sourceId, value)
}

export async function saveCache<T>(
  runtime: Runtime,
  sourceId: string,
  cached: Omit<CachedSource<T>, 'schemaVersion'>,
): Promise<void> {
  const compressed = compressForStorage(sourceId, cached)
  const cleaned = stripNulls(compressed)
  await runtime.setValue(CACHE_KEY(sourceId), {
    ...cleaned,
    schemaVersion: CACHE_SCHEMA_VERSION,
  })
}

export function isStale(cached: CachedSource<unknown> | null, ttlMs: number, now: number): boolean {
  if (!cached) return true
  return now - cached.fetchedAt > ttlMs
}

export function isVeryStale(
  cached: CachedSource<unknown> | null,
  ttlMs: number,
  now: number,
): boolean {
  if (!cached) return false
  return now - cached.fetchedAt > ttlMs * VERY_STALE_MULTIPLIER
}

/** Returns true when the cache has a `nextRetryAt` that hasn't elapsed yet. */
export function isInBackoff(cached: CachedSource<unknown> | null, now: number): boolean {
  if (!cached) return false
  if (typeof cached.nextRetryAt !== 'number') return false
  return now < cached.nextRetryAt
}
