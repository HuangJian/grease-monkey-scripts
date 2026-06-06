import type { Runtime } from '../../runtime'
import { CACHE_KEY, type CachedSource } from '../types'
import { TOPICS_HISTORY_TTL } from './constants'
import type { V2exTopic } from './types'

const TOPIC_STATE_KEY = 'gm:v2ex:topic-state'
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
  markRead(id: number, ts?: number): void
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
  const readAt = new Map<number, number>()
  const hiddenAt = new Map<number, number>()
  let cachedHistory: StoredHistoryTopic[] | null = null
  let migrationDone = false

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
    filterVisible(topics) {
      return topics.filter((t) => !hiddenAt.has(t.id))
    },
    async loadFromStorage(runtime) {
      const stored = await runtime.getValue<Record<string, { r?: number; h?: number }> | null>(
        TOPIC_STATE_KEY,
        null,
      )
      const now = Date.now()
      if (stored) {
        for (const [idStr, entry] of Object.entries(stored)) {
          const id = Number(idStr)
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
          obj[String(id)] = { r: ts }
        }
      }
      for (const [id, ts] of hiddenAt) {
        if (now - ts < TOPIC_STATE_TTL) {
          const prev = obj[String(id)]
          obj[String(id)] = prev ? { ...prev, h: ts } : { h: ts }
        }
      }
      await runtime.setValue(TOPIC_STATE_KEY, obj)
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
      readAt.clear()
      hiddenAt.clear()
      cachedHistory = null
    },
  }
}
