import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeFromCachedGrouped, unionUnique } from '../browse-state'
import { HISTORY_KEY } from './constants'
import type { HupuPost, StoredHistoryPost } from './types'

const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000

export type HupuState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  getReadReplies(id: string): number | undefined
  markRead(id: string, ts?: number, replies?: number): void
  markHidden(id: string, ts?: number): void
  filterVisible(posts: ReadonlyArray<HupuPost>): HupuPost[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  loadHistory(runtime: Runtime, historyDays: number): Promise<StoredHistoryPost[]>
  saveHistory(runtime: Runtime, posts: ReadonlyArray<HupuPost>, historyDays: number): Promise<void>
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  removeFromHistory(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createHupuState(): HupuState {
  const itemState: ItemState<string> = createItemState<string>({
    storageKey: STATE_KEY('hupu'),
    ttlMs: TOPIC_STATE_TTL,
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
        const stored = await runtime.getValue<StoredHistoryPost[] | null>(HISTORY_KEY, null)
        if (!stored || !Array.isArray(stored)) {
          cachedHistory = []
          return cachedHistory
        }
        const now = Date.now()
        cachedHistory = stored.filter((t) => {
          if (!Number.isFinite(t.created) || t.created <= 0) return false
          return now - t.created < historyTtl
        })
        return cachedHistory
      } catch {
        cachedHistory = []
        return cachedHistory
      }
    },
    async saveHistory(runtime, posts, historyDays) {
      const historyTtl = historyDays * 24 * 60 * 60 * 1000
      const now = Date.now()
      const existing = await this.loadHistory(runtime, historyDays)
      const byId = new Map<string, StoredHistoryPost>()
      existing.forEach((t) => byId.set(t.id, t))
      posts
        .filter((t) => Number.isFinite(t.created) && t.created > 0)
        .forEach((t) => {
          const existingEntry = byId.get(t.id)
          if (existingEntry) {
            byId.set(t.id, {
              id: t.id,
              title: t.title || existingEntry.title,
              url: t.url || existingEntry.url,
              lights: Math.max(existingEntry.lights, t.lights),
              replies: Math.max(existingEntry.replies, t.replies),
              views: Math.max(existingEntry.views, t.views),
              author: t.author || existingEntry.author,
              authorUrl: t.authorUrl || existingEntry.authorUrl,
              boards: unionUnique(existingEntry.boards, [t.board]),
              topicName: t.topicName || existingEntry.topicName,
              created: Math.min(existingEntry.created, t.created),
            })
          } else {
            byId.set(t.id, {
              id: t.id,
              title: t.title,
              url: t.url,
              lights: t.lights,
              replies: t.replies,
              views: t.views,
              author: t.author,
              authorUrl: t.authorUrl,
              boards: [t.board],
              topicName: t.topicName,
              created: t.created,
            })
          }
        })
      const result = Array.from(byId.values()).filter(
        (t) => Number.isFinite(t.created) && t.created > 0 && now - t.created < historyTtl,
      )
      cachedHistory = result
      await runtime.setValue(HISTORY_KEY, result)
    },
    async removeFromCache(runtime, id) {
      await removeFromCachedGrouped<HupuPost>(runtime, 'hupu', id)
    },
    async removeFromHistory(runtime, id) {
      try {
        const existing = await this.loadHistory(runtime, 7)
        const filtered = existing.filter((t) => t.id !== id)
        if (filtered.length === existing.length) return
        cachedHistory = filtered
        await runtime.setValue(HISTORY_KEY, filtered)
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
