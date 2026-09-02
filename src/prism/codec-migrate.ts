import type { CachedSource } from './types'
import { CACHE_SCHEMA_VERSION } from './types'
import { expandFromStorage, codecVersionFor } from './codec'

/**
 * Upgrades a stored cache value to the current in-memory shape.
 * Returns null when the value cannot be migrated; callers then drop it
 * and refetch rather than trusting an unknown format.
 *
 * `codecVersion` being absent is treated as legacy pre-codec data: the
 * sniff-based expanders pass already-expanded items through unchanged.
 */
export function migrateCache<T>(sourceId: string, value: unknown): CachedSource<T> | null {
  if (value === null || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.fetchedAt !== 'number') return null
  if (v.schemaVersion !== CACHE_SCHEMA_VERSION) return null
  const currentVersion = codecVersionFor(sourceId)
  if (
    currentVersion !== null &&
    v.codecVersion !== undefined &&
    v.codecVersion !== currentVersion
  ) {
    return null
  }
  return expandFromStorage(sourceId, value as unknown as CachedSource<T>)
}
