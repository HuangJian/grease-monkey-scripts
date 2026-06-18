import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeFromCachedGrouped, unionUnique } from '../browse-state'
import { HISTORY_KEY } from './constants'
import type { RedditPost, StoredHistoryPost } from './types'

const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000

type HistoryPostShort = {
  id: string
  t?: string
  u?: string
  s?: number
  r?: number
  sb?: string[]
  a?: string
  c?: number
}

function compressHistoryPost(v: StoredHistoryPost): HistoryPostShort {
  return {
    id: v.id,
    t: v.title,
    u: v.url,
    s: v.score,
    r: v.numComments,
    a: v.author,
    sb: [...v.subreddits],
    c: Math.floor(v.created / 60000),
  }
}

function expandHistoryPost(v: HistoryPostShort): StoredHistoryPost {
  const created = v.c !== undefined && v.c < 1e9 ? v.c * 60000 : (v.c ?? 0)
  return {
    id: v.id,
    title: v.t ?? '',
    url: v.u ?? '',
    score: v.s ?? 0,
    numComments: v.r ?? 0,
    author: v.a ?? '',
    subreddits: v.sb ?? [],
    created,
  }
}

function isShortFormat(v: Record<string, unknown>): boolean {
  return 't' in v
}

export type RedditState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  getReadReplies(id: string): number | undefined
  markRead(id: string, ts?: number, replies?: number): void
  markHidden(id: string, ts?: number): void
  filterVisible(posts: ReadonlyArray<RedditPost>): RedditPost[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  loadHistory(runtime: Runtime, historyDays: number): Promise<StoredHistoryPost[]>
  saveHistory(
    runtime: Runtime,
    posts: ReadonlyArray<RedditPost>,
    historyDays: number,
  ): Promise<void>
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  removeFromHistory(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createRedditState(): RedditState {
  const itemState: ItemState<string> = createItemState<string>({
    storageKey: STATE_KEY('reddit'),
    ttlMs: TOPIC_STATE_TTL,
    oldStorageKey: 'gm:reddit:topic-state',
  })
  let cachedHistory: StoredHistoryPost[] | null = null

  return {
    isRead(id) {
      return itemState.isRead(id)
    },
    isHidden(id) {
      return itemState.isHidden(id)
    },
    getReadReplies(id) {
      return itemState.getReadReplies(id)
    },
    markRead(id, ts, replies) {
      itemState.markRead(id, ts, replies)
    },
    markHidden(id, ts) {
      itemState.markHidden(id, ts)
    },
    filterVisible(posts) {
      return itemState.filterVisible(posts)
    },
    async loadFromStorage(runtime) {
      await itemState.loadFromStorage(runtime)
    },
    async saveToStorage(runtime) {
      await itemState.saveToStorage(runtime)
    },
    async loadHistory(runtime, historyDays) {
      if (cachedHistory) return cachedHistory
      const historyTtl = historyDays * 24 * 60 * 60 * 1000
      try {
        const stored = await runtime.getValue<Record<string, unknown>[] | null>(HISTORY_KEY, null)
        if (!stored || !Array.isArray(stored)) {
          cachedHistory = []
          return cachedHistory
        }
        const now = Date.now()
        cachedHistory = stored
          .filter((t) => {
            const post = isShortFormat(t)
              ? expandHistoryPost(t as HistoryPostShort)
              : (t as StoredHistoryPost)
            return (
              Number.isFinite(post.created) && post.created > 0 && now - post.created < historyTtl
            )
          })
          .map((t) =>
            isShortFormat(t) ? expandHistoryPost(t as HistoryPostShort) : (t as StoredHistoryPost),
          )
        return cachedHistory
      } catch {
        cachedHistory = []
        return cachedHistory
      }
    },
    async saveHistory(runtime, topics, historyDays) {
      const historyTtl = historyDays * 24 * 60 * 60 * 1000
      const now = Date.now()
      const existing = await this.loadHistory(runtime, historyDays)
      const byId = new Map<string, StoredHistoryPost>()
      existing.forEach((t) => byId.set(t.id, t))
      topics.forEach((t) => {
        if (!Number.isFinite(t.created) || t.created <= 0) return
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
      })
      const result = Array.from(byId.values()).filter(
        (t) => Number.isFinite(t.created) && t.created > 0 && now - t.created < historyTtl,
      )
      cachedHistory = result
      await runtime.setValue(HISTORY_KEY, result.map(compressHistoryPost))
    },
    async removeFromCache(runtime, id) {
      await removeFromCachedGrouped<RedditPost>(runtime, 'reddit', id)
    },
    async removeFromHistory(runtime, id) {
      try {
        const existing = await this.loadHistory(runtime, 7)
        const filtered = existing.filter((t) => t.id !== id)
        if (filtered.length === existing.length) return
        cachedHistory = filtered
        await runtime.setValue(HISTORY_KEY, filtered.map(compressHistoryPost))
      } catch {
        /* ignore */
      }
    },
    clear() {
      itemState.clear()
      cachedHistory = null
    },
  }
}
