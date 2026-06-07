import type { Runtime } from '../runtime'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, VERY_STALE_MULTIPLIER, type CachedSource } from './types'

export type SaveResult = 'ok'

export function estimateByteSize(payload: unknown): number {
  try {
    return new Blob([JSON.stringify(payload)]).size
  } catch {
    return 0
  }
}

export async function loadCache<T>(
  runtime: Runtime,
  sourceId: string,
): Promise<CachedSource<T> | null> {
  const value = await runtime.getValue<CachedSource<T> | null>(CACHE_KEY(sourceId), null)
  if (!value || typeof value.fetchedAt !== 'number') return null
  if (value.schemaVersion !== CACHE_SCHEMA_VERSION) return null
  return value
}

export async function saveCache<T>(
  runtime: Runtime,
  sourceId: string,
  cached: Omit<CachedSource<T>, 'schemaVersion' | 'byteSize'>,
): Promise<SaveResult> {
  const byteSize = estimateByteSize(cached)
  const full: CachedSource<T> = {
    ...cached,
    schemaVersion: CACHE_SCHEMA_VERSION,
    byteSize,
  }
  await runtime.setValue(CACHE_KEY(sourceId), full)
  return 'ok'
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
