import type { Runtime } from '../../runtime'
import { CACHE_KEY, type CachedSource } from '../types'
import type { V2exTopic } from './types'

const TOPIC_STATE_KEY = 'gm:v2ex:topic-state'
const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000
const API_TOPICS_KEY = 'gm:v2ex:api-topics'
const API_TOPICS_TTL = 48 * 60 * 60 * 1000

export type StoredApiTopic = {
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
  loadApiHistory(runtime: Runtime): Promise<StoredApiTopic[]>
  saveApiHistory(runtime: Runtime, topics: ReadonlyArray<V2exTopic>): Promise<void>
  removeFromCache(runtime: Runtime, topicId: number): Promise<void>
  clear(): void
}

export function createV2exState(): V2exState {
  const readAt = new Map<number, number>()
  const hiddenAt = new Map<number, number>()
  let cachedApiTopics: StoredApiTopic[] | null = null

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
    async loadApiHistory(runtime) {
      if (cachedApiTopics) return cachedApiTopics
      try {
        const stored = await runtime.getValue<StoredApiTopic[] | null>(API_TOPICS_KEY, null)
        if (!stored || !Array.isArray(stored)) {
          cachedApiTopics = []
          return cachedApiTopics
        }
        const now = Date.now()
        cachedApiTopics = stored.filter((t) => now - t.fetchedAt < API_TOPICS_TTL)
        return cachedApiTopics
      } catch {
        cachedApiTopics = []
        return cachedApiTopics
      }
    },
    async saveApiHistory(runtime, topics) {
      const now = Date.now()
      const existing = await this.loadApiHistory(runtime)
      const byId = new Map<number, StoredApiTopic>()
      for (const t of existing) {
        byId.set(t.id, t)
      }
      for (const t of topics) {
        if (byId.has(t.id)) continue
        byId.set(t.id, {
          id: t.id,
          title: t.title,
          url: t.url,
          replies: t.replies,
          member: t.member,
          node: t.node,
          fetchedAt: now,
          created: t.created,
        })
      }
      const result = Array.from(byId.values()).filter((t) => now - t.fetchedAt < API_TOPICS_TTL)
      cachedApiTopics = result
      await runtime.setValue(API_TOPICS_KEY, result)
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
      cachedApiTopics = null
    },
  }
}
