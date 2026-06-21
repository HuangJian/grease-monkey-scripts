import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'
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
  const itemState = createItemState<number>({
    storageKey: STATE_KEY('v2ex'),
    ttlMs: 72 * 60 * 60 * 1000,
    oldStorageKey: 'gm:v2ex:topic-state',
    serializeId: String,
    deserializeId: Number,
  })

  return {
    ...(itemState as unknown as V2exState),
    async removeFromCache(runtime, topicId) {
      await removeItemFromCache(runtime, 'v2ex', topicId)
    },
  }
}
