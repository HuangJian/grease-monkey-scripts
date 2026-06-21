import type { Runtime } from '../runtime'

const MINUTE_MS = 60_000

type StoredEntry = { r?: number; h?: number; n?: number }

export type ItemStateOptions<T extends string | number> = {
  storageKey: string
  ttlMs: number
  oldStorageKey?: string
  serializeId?: (id: T) => string
  deserializeId?: (s: string) => T
}

export type ItemState<T extends string | number = string> = {
  isRead(id: T): boolean
  isHidden(id: T): boolean
  getReadReplies(id: T): number | undefined
  markRead(id: T, ts?: number, replies?: number): void
  markHidden(id: T, ts?: number): void
  filterVisible<U extends { id: T }>(items: ReadonlyArray<U>): U[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  clear(): void
}

function identity<T>(x: T): T {
  return x
}

function msToMin(ts: number): number {
  return Math.floor(ts / MINUTE_MS)
}

function minToMs(min: number): number {
  return min * MINUTE_MS
}

export function createItemState<T extends string | number = string>(
  options: ItemStateOptions<T>,
): ItemState<T> {
  const { storageKey, ttlMs, oldStorageKey, serializeId = identity as (id: T) => string } = options

  const readAt = new Map<string, number>()
  const readReplies = new Map<string, number>()
  const hiddenAt = new Map<string, number>()

  function expireNow(map: Map<string, number>): void {
    const now = Date.now()
    Array.from(map)
      .filter(([, ts]) => now - ts >= ttlMs)
      .forEach(([k]) => map.delete(k))
  }

  return {
    isRead(id) {
      return readAt.has(serializeId(id))
    },
    isHidden(id) {
      return hiddenAt.has(serializeId(id))
    },
    getReadReplies(id) {
      return readReplies.get(serializeId(id))
    },
    markRead(id, ts = Date.now(), replies) {
      const key = serializeId(id)
      readAt.set(key, ts)
      if (replies !== undefined) readReplies.set(key, replies)
    },
    markHidden(id, ts = Date.now()) {
      hiddenAt.set(serializeId(id), ts)
    },
    filterVisible(items) {
      return items.filter((it) => !hiddenAt.has(serializeId(it.id)))
    },
    async loadFromStorage(runtime) {
      const now = Date.now()

      async function loadFrom(key: string, isMinFormat: boolean): Promise<boolean> {
        const stored = await runtime.getValue<Record<string, StoredEntry> | null>(key, null)
        if (!stored) return false
        Object.entries(stored).forEach(([idStr, entry]) => {
          const r = isMinFormat && entry.r != null ? minToMs(entry.r) : entry.r
          const h = isMinFormat && entry.h != null ? minToMs(entry.h) : entry.h
          if (r != null && now - r < ttlMs && !readAt.has(idStr)) {
            readAt.set(idStr, r)
          }
          if (entry.n !== undefined && !readReplies.has(idStr)) {
            readReplies.set(idStr, entry.n)
          }
          if (h != null && now - h < ttlMs && !hiddenAt.has(idStr)) {
            hiddenAt.set(idStr, h)
          }
        })
        return true
      }

      const hasNew = await loadFrom(storageKey, true)

      if (!hasNew && oldStorageKey) {
        const hasOld = await loadFrom(oldStorageKey, false)
        if (hasOld) {
          await this.saveToStorage(runtime)
          await runtime.setValue(oldStorageKey, null)
        }
      }

      expireNow(readAt)
      expireNow(hiddenAt)
    },
    async saveToStorage(runtime) {
      const now = Date.now()
      const obj: Record<string, StoredEntry> = {}
      Array.from(readAt)
        .filter(([, ts]) => now - ts < ttlMs)
        .forEach(([id, ts]) => {
          const entry: StoredEntry = { r: msToMin(ts) }
          const replies = readReplies.get(id)
          if (replies !== undefined) entry.n = replies
          obj[id] = entry
        })
      Array.from(hiddenAt)
        .filter(([, ts]) => now - ts < ttlMs)
        .forEach(([id, ts]) => {
          const prev = obj[id]
          obj[id] = prev ? { ...prev, h: msToMin(ts) } : { h: msToMin(ts) }
        })
      await runtime.setValue(storageKey, obj)
    },
    clear() {
      readAt.clear()
      readReplies.clear()
      hiddenAt.clear()
    },
  }
}

export type Expandable = {
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  clear(): void
}

export function createExpandedState(): Expandable {
  const expandedAt = new Map<string, number>()
  return {
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
    clear() {
      expandedAt.clear()
    },
  }
}
