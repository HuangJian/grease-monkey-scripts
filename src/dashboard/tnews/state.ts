import type { Runtime } from '../../runtime'
import { CACHE_KEY, type CachedSource } from '../types'
import { STATE_KEY, STATE_TTL } from './constants'
import type { TnewsItem } from './types'

type StoredEntry = { r?: number; h?: number }

export type TnewsState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  markRead(id: string, ts?: number): void
  markHidden(id: string, ts?: number): void
  filterVisible(items: ReadonlyArray<TnewsItem>): TnewsItem[]
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createTnewsState(): TnewsState {
  const readAt = new Map<string, number>()
  const hiddenAt = new Map<string, number>()
  const expandedAt = new Map<string, number>()

  function expire(now: number, map: Map<string, number>): void {
    for (const [k, ts] of map) {
      if (now - ts >= STATE_TTL) map.delete(k)
    }
  }

  return {
    isRead(id) {
      return readAt.has(id)
    },
    isHidden(id) {
      return hiddenAt.has(id)
    },
    markRead(id, ts = Date.now()) {
      readAt.set(id, ts)
    },
    markHidden(id, ts = Date.now()) {
      hiddenAt.set(id, ts)
    },
    filterVisible(items) {
      return items.filter((it) => !hiddenAt.has(it.id))
    },
    isExpanded(id) {
      return expandedAt.has(id)
    },
    toggleExpanded(id) {
      if (expandedAt.has(id)) {
        expandedAt.delete(id)
        return false
      }
      expandedAt.set(id, Date.now())
      return true
    },
    setExpanded(id, expanded) {
      if (expanded) expandedAt.set(id, Date.now())
      else expandedAt.delete(id)
    },
    async loadFromStorage(runtime) {
      try {
        const stored = await runtime.getValue<Record<string, StoredEntry> | null>(STATE_KEY, null)
        const now = Date.now()
        if (stored) {
          for (const [id, entry] of Object.entries(stored)) {
            if (entry.r && now - entry.r < STATE_TTL && !readAt.has(id)) {
              readAt.set(id, entry.r)
            }
            if (entry.h && now - entry.h < STATE_TTL && !hiddenAt.has(id)) {
              hiddenAt.set(id, entry.h)
            }
          }
        }
        expire(now, readAt)
        expire(now, hiddenAt)
      } catch {
        /* ignore */
      }
    },
    async saveToStorage(runtime) {
      const now = Date.now()
      const obj: Record<string, StoredEntry> = {}
      for (const [id, ts] of readAt) {
        if (now - ts < STATE_TTL) {
          obj[id] = { r: ts }
        }
      }
      for (const [id, ts] of hiddenAt) {
        if (now - ts < STATE_TTL) {
          const prev = obj[id]
          obj[id] = prev ? { ...prev, h: ts } : { h: ts }
        }
      }
      await runtime.setValue(STATE_KEY, obj)
    },
    async removeFromCache(runtime, id) {
      try {
        const cached = await runtime.getValue<CachedSource<TnewsItem[]> | null>(
          CACHE_KEY('tnews'),
          null,
        )
        if (!cached?.data || !Array.isArray(cached.data)) return
        const filtered = cached.data.filter((it) => it.id !== id)
        if (filtered.length === cached.data.length) return
        await runtime.setValue(CACHE_KEY('tnews'), { ...cached, data: filtered })
      } catch {
        /* ignore */
      }
    },
    clear() {
      readAt.clear()
      hiddenAt.clear()
      expandedAt.clear()
    },
  }
}
