import type { Runtime } from '../runtime'
import { CACHE_KEY, type CachedSource } from './types'

export function unionUnique(a: ReadonlyArray<string>, b: ReadonlyArray<string>): string[] {
  return [...new Set([...a, ...b])]
}

export async function removeFromCachedGrouped<T extends { id: string }>(
  runtime: Runtime,
  sourceId: string,
  id: string,
): Promise<void> {
  try {
    const cached = await runtime.getValue<CachedSource<Record<string, T[]>> | null>(
      CACHE_KEY(sourceId),
      null,
    )
    if (!cached?.data || typeof cached.data !== 'object' || Array.isArray(cached.data)) return
    const next: Record<string, T[]> = {}
    let changed = false
    Object.entries(cached.data).forEach(([key, items]) => {
      const filtered = items.filter((p) => p.id !== id)
      if (filtered.length !== items.length) changed = true
      if (filtered.length > 0) next[key] = filtered
    })
    if (!changed) return
    await runtime.setValue(CACHE_KEY(sourceId), { ...cached, data: next })
  } catch {
    /* ignore */
  }
}
