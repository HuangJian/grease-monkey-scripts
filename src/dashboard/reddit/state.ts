import type { Runtime } from '../../runtime'
import { TOPIC_STATE_KEY, TOPIC_STATE_TTL } from './constants'
import type { RedditPost } from './types'

export type RedditState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  markRead(id: string, ts?: number): void
  markHidden(id: string, ts?: number): void
  filterVisible(posts: ReadonlyArray<RedditPost>): RedditPost[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  clear(): void
}

export function createRedditState(): RedditState {
  const readAt = new Map<string, number>()
  const hiddenAt = new Map<string, number>()

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
    clear() {
      readAt.clear()
      hiddenAt.clear()
    },
  }
}

export function clearRedditTopicState(): void {}
