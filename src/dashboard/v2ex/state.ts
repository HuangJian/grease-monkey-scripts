import type { Runtime } from '../../runtime'
import { CACHE_KEY, STATE_KEY, type CachedSource } from '../types'
import { createItemState, type ItemState } from '../item-state'
import type { V2exTopic } from './types'

export type V2exState = {
  isRead(id: number): boolean
  isHidden(id: number): boolean
  getReadReplies(id: number): number | undefined
  markRead(id: number, ts?: number, replies?: number): void
  markHidden(id: number, ts?: number): void
  filterVisible(topics: ReadonlyArray<V2exTopic>): V2exTopic[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  removeFromCache(runtime: Runtime, topicId: number): Promise<void>
  clear(): void
}

export function createV2exState(): V2exState {
  const itemState: ItemState<number> = createItemState<number>({
    storageKey: STATE_KEY('v2ex'),
    ttlMs: 72 * 60 * 60 * 1000,
    oldStorageKey: 'gm:v2ex:topic-state',
    serializeId: String,
    deserializeId: Number,
  })

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
    },
  }
}
