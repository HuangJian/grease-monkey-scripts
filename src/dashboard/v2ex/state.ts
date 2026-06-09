import type { Runtime } from '../../runtime'
import { CACHE_KEY, STATE_KEY, type CachedSource } from '../types'
import { createItemState, type ItemState } from '../item-state'
import { TOPICS_HISTORY_TTL } from './constants'
import type { V2exTopic } from './types'

const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000
const TOPICS_HISTORY_KEY = 'gm:v2ex:topics-history'
const OLD_API_TOPICS_KEY = 'gm:v2ex:api-topics'

export type StoredHistoryTopic = {
  id: number
  title: string
  url: string
  replies: number
  member: { username: string }
  node: { title: string }
  created?: number
}

type OldStoredApiTopic = {
  id: number
  title: string
  url: string
  replies: number
  member: { username: string }
  node: { title: string }
  fetchedAt: number
  created?: number
}

export type V2exState = {
  isRead(id: number): boolean
  isHidden(id: number): boolean
  getReadReplies(id: number): number | undefined
  markRead(id: number, ts?: number, replies?: number): void
  markHidden(id: number, ts?: number): void
  filterVisible(topics: ReadonlyArray<V2exTopic>): V2exTopic[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  loadHistory(runtime: Runtime): Promise<StoredHistoryTopic[]>
  saveHistory(runtime: Runtime, topics: ReadonlyArray<V2exTopic>): Promise<void>
  removeFromCache(runtime: Runtime, topicId: number): Promise<void>
  clear(): void
}

export function createV2exState(): V2exState {
  const itemState: ItemState<number> = createItemState<number>({
    storageKey: STATE_KEY('v2ex'),
    ttlMs: TOPIC_STATE_TTL,
    oldStorageKey: 'gm:v2ex:topic-state',
    serializeId: String,
    deserializeId: Number,
  })
  let cachedHistory: StoredHistoryTopic[] | null = null
  let migrationDone = false

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
    filterVisible(topics) {
      return itemState.filterVisible(topics)
    },
    async loadFromStorage(runtime) {
      await itemState.loadFromStorage(runtime)
    },
    async saveToStorage(runtime) {
      await itemState.saveToStorage(runtime)
    },
    async loadHistory(runtime) {
      if (cachedHistory) return cachedHistory
      if (!migrationDone) {
        migrationDone = true
        try {
          const old = await runtime.getValue<OldStoredApiTopic[] | null>(OLD_API_TOPICS_KEY, null)
          if (old && Array.isArray(old) && old.length > 0) {
            const now = Date.now()
            const migrated = old
              .filter((t) => {
                const created = t.created ?? t.fetchedAt
                return created && now - created < TOPICS_HISTORY_TTL
              })
              .map((t) => ({
                id: t.id,
                title: t.title,
                url: t.url,
                replies: t.replies,
                member: t.member,
                node: t.node,
                created: t.created ?? t.fetchedAt,
              }))
            const existing = await runtime.getValue<StoredHistoryTopic[] | null>(
              TOPICS_HISTORY_KEY,
              null,
            )
            const merged = existing ? [...existing, ...migrated] : migrated
            await runtime.setValue(TOPICS_HISTORY_KEY, merged)
          }
          await runtime.setValue(OLD_API_TOPICS_KEY, null)
        } catch {
          /* ignore migration errors */
        }
      }
      try {
        const stored = await runtime.getValue<StoredHistoryTopic[] | null>(TOPICS_HISTORY_KEY, null)
        if (!stored || !Array.isArray(stored)) {
          cachedHistory = []
          return cachedHistory
        }
        const now = Date.now()
        cachedHistory = stored.filter((t) => {
          if (t.created === undefined) return false
          return now - t.created < TOPICS_HISTORY_TTL
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
      const byId = new Map<number, StoredHistoryTopic>()
      for (const t of existing) {
        byId.set(t.id, t)
      }
      for (const t of topics) {
        if (!t.created || !Number.isFinite(t.created) || t.created <= 0) continue
        const existingEntry = byId.get(t.id)
        byId.set(t.id, {
          id: t.id,
          title: t.title,
          url: t.url,
          replies: Math.max(existingEntry?.replies ?? 0, t.replies),
          member: t.member,
          node: t.node,
          created: t.created,
        })
      }
      const result = Array.from(byId.values()).filter(
        (t) => t.created !== undefined && now - t.created < TOPICS_HISTORY_TTL,
      )
      cachedHistory = result
      await runtime.setValue(TOPICS_HISTORY_KEY, result)
    },
    async removeFromCache(runtime, topicId) {
      try {
        const cached = await runtime.getValue<CachedSource<V2exTopic[]> | null>(
          CACHE_KEY('v2ex'),
          null,
        )
        if (!cached?.data || !Array.isArray(cached.data)) return
        const filtered = cached.data.filter((t) => t.id !== topicId)
        await runtime.setValue(CACHE_KEY('v2ex'), { ...cached, data: filtered })
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
