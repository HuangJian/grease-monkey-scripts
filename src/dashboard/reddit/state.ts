import { CACHE_KEY, type CachedSource } from '../types'
import type { Runtime } from '../../runtime'
import { HISTORY_KEY, TOPIC_STATE_KEY, TOPIC_STATE_TTL } from './constants'
import type { RedditPost, StoredHistoryPost } from './types'

export type RedditState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  markRead(id: string, ts?: number): void
  markHidden(id: string, ts?: number): void
  filterVisible(posts: ReadonlyArray<RedditPost>): RedditPost[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  loadHistory(runtime: Runtime): Promise<StoredHistoryPost[]>
  saveHistory(runtime: Runtime, posts: ReadonlyArray<RedditPost>): Promise<void>
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  removeFromHistory(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

function unionUnique(a: ReadonlyArray<string>, b: ReadonlyArray<string>): string[] {
  const out: string[] = []
  for (const s of a) if (!out.includes(s)) out.push(s)
  for (const s of b) if (!out.includes(s)) out.push(s)
  return out
}

export function createRedditState(): RedditState {
  const readAt = new Map<string, number>()
  const hiddenAt = new Map<string, number>()
  let cachedHistory: StoredHistoryPost[] | null = null

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
    filterVisible(posts) {
      return posts.filter((p) => !hiddenAt.has(p.id))
    },
    async loadFromStorage(runtime) {
      const stored = await runtime.getValue<Record<string, { r?: number; h?: number }> | null>(
        TOPIC_STATE_KEY,
        null,
      )
      const now = Date.now()
      if (stored) {
        for (const [idStr, entry] of Object.entries(stored)) {
          const id = idStr
          if (entry.r && now - entry.r < TOPIC_STATE_TTL && !readAt.has(id)) {
            readAt.set(id, entry.r)
          }
          if (entry.h && now - entry.h < TOPIC_STATE_TTL && !hiddenAt.has(id)) {
            hiddenAt.set(id, entry.h)
          }
        }
      }
      for (const [id, ts] of readAt) {
        if (now - ts >= TOPIC_STATE_TTL) readAt.delete(id)
      }
      for (const [id, ts] of hiddenAt) {
        if (now - ts >= TOPIC_STATE_TTL) hiddenAt.delete(id)
      }
    },
    async saveToStorage(runtime) {
      const now = Date.now()
      const obj: Record<string, { r?: number; h?: number }> = {}
      for (const [id, ts] of readAt) {
        if (now - ts < TOPIC_STATE_TTL) {
          obj[id] = { r: ts }
        }
      }
      for (const [id, ts] of hiddenAt) {
        if (now - ts < TOPIC_STATE_TTL) {
          const prev = obj[id]
          obj[id] = prev ? { ...prev, h: ts } : { h: ts }
        }
      }
      await runtime.setValue(TOPIC_STATE_KEY, obj)
    },
    async loadHistory(runtime) {
      if (cachedHistory) return cachedHistory
      try {
        const stored = await runtime.getValue<StoredHistoryPost[] | null>(HISTORY_KEY, null)
        if (!stored || !Array.isArray(stored)) {
          cachedHistory = []
          return cachedHistory
        }
        const now = Date.now()
        cachedHistory = stored.filter((t) => {
          if (!Number.isFinite(t.created) || t.created <= 0) return false
          return now - t.created < TOPIC_STATE_TTL
        })
        return cachedHistory
      } catch {
        cachedHistory = []
        return cachedHistory
      }
    },
    async saveHistory(runtime, topics) {
      const now = Date.now()
      const existing = await this.loadHistory(runtime)
      const byId = new Map<string, StoredHistoryPost>()
      for (const t of existing) byId.set(t.id, t)
      for (const t of topics) {
        if (!Number.isFinite(t.created) || t.created <= 0) continue
        const existingEntry = byId.get(t.id)
        if (existingEntry) {
          byId.set(t.id, {
            id: t.id,
            title: t.title || existingEntry.title,
            url: t.url || existingEntry.url,
            score: Math.max(existingEntry.score, t.score),
            numComments: Math.max(existingEntry.numComments, t.numComments),
            author: t.author || existingEntry.author,
            subreddits: unionUnique(existingEntry.subreddits, t.subreddits),
            created: Math.min(existingEntry.created, t.created),
          })
        } else {
          byId.set(t.id, {
            id: t.id,
            title: t.title,
            url: t.url,
            score: t.score,
            numComments: t.numComments,
            author: t.author,
            subreddits: [...t.subreddits],
            created: t.created,
          })
        }
      }
      const result = Array.from(byId.values()).filter(
        (t) => Number.isFinite(t.created) && t.created > 0 && now - t.created < TOPIC_STATE_TTL,
      )
      cachedHistory = result
      await runtime.setValue(HISTORY_KEY, result)
    },
    async removeFromCache(runtime, id) {
      try {
        const cached = await runtime.getValue<CachedSource<unknown> | null>(
          CACHE_KEY('reddit'),
          null,
        )
        if (!cached?.data || typeof cached.data !== 'object' || Array.isArray(cached.data)) return
        const next: Record<string, RedditPost[]> = {}
        let changed = false
        for (const [sub, posts] of Object.entries(cached.data as Record<string, RedditPost[]>)) {
          const filtered = posts.filter((p) => p.id !== id)
          if (filtered.length !== posts.length) changed = true
          if (filtered.length > 0) next[sub] = filtered
        }
        if (!changed) return
        await runtime.setValue(CACHE_KEY('reddit'), { ...cached, data: next })
      } catch {
        /* ignore */
      }
    },
    async removeFromHistory(runtime, id) {
      try {
        const existing = await this.loadHistory(runtime)
        const filtered = existing.filter((t) => t.id !== id)
        if (filtered.length === existing.length) return
        cachedHistory = filtered
        await runtime.setValue(HISTORY_KEY, filtered)
      } catch {
        /* ignore */
      }
    },
    clear() {
      readAt.clear()
      hiddenAt.clear()
      cachedHistory = null
    },
  }
}
