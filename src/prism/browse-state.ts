import type { Runtime } from '../runtime'
import { CACHE_KEY, type CachedSource } from './types'

export function unionUnique(a: ReadonlyArray<string>, b: ReadonlyArray<string>): string[] {
  return [...new Set([...a, ...b])]
}

export async function removeItemFromCache(
  runtime: Runtime,
  sourceId: string,
  itemId: unknown,
): Promise<void> {
  try {
    const key = CACHE_KEY(sourceId)
    const cached = await runtime.getValue<CachedSource<unknown> | null>(key, null)
    if (!cached?.data) return

    if (Array.isArray(cached.data)) {
      const arr = cached.data as Array<{ id: unknown }>
      const next = arr.filter((it) => it.id !== itemId)
      if (next.length === arr.length) return
      await runtime.setValue(key, { ...cached, data: next })
    } else if (typeof cached.data === 'object' && cached.data !== null) {
      const grouped = cached.data as Record<string, Array<{ id: unknown }>>
      const next: Record<string, unknown[]> = {}
      let changed = false
      for (const [k, items] of Object.entries(grouped)) {
        const f = items.filter((p) => p.id !== itemId)
        if (f.length !== items.length) changed = true
        if (f.length > 0) next[k] = f
      }
      if (!changed) return
      await runtime.setValue(key, { ...cached, data: next })
    }
  } catch {
    /* ignore */
  }
}
