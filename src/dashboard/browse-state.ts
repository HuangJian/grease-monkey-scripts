import type { Runtime } from '../runtime'
import { CACHE_KEY, type CachedSource } from './types'

export function unionUnique(a: ReadonlyArray<string>, b: ReadonlyArray<string>): string[] {
  const out: string[] = []
  for (const s of a) if (!out.includes(s)) out.push(s)
  for (const s of b) if (!out.includes(s)) out.push(s)
  return out
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
    for (const [key, items] of Object.entries(cached.data)) {
      const filtered = items.filter((p) => p.id !== id)
      if (filtered.length !== items.length) changed = true
      if (filtered.length > 0) next[key] = filtered
    }
    if (!changed) return
    await runtime.setValue(CACHE_KEY(sourceId), { ...cached, data: next })
  } catch {
    /* ignore */
  }
}
