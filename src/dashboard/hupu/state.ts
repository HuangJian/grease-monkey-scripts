import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeFromCachedGrouped } from '../browse-state'
import type { HupuPost } from './types'

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
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createHupuState(): HupuState {
  const itemState: ItemState<string> = createItemState<string>({
    storageKey: STATE_KEY('hupu'),
    ttlMs: TOPIC_STATE_TTL,
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
    filterVisible(posts) {
      return itemState.filterVisible(posts)
    },
    async loadFromStorage(runtime) {
      await itemState.loadFromStorage(runtime)
    },
    async saveToStorage(runtime) {
      await itemState.saveToStorage(runtime)
    },
    async removeFromCache(runtime, id) {
      await removeFromCachedGrouped<HupuPost>(runtime, 'hupu', id)
    },
    clear() {
      itemState.clear()
    },
  }
}
