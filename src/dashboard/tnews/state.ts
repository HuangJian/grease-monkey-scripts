import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, type ItemState, removeItemFromCacheById } from '../item-state'
import type { TnewsItem } from './types'

const STATE_TTL = 7 * 24 * 60 * 60 * 1000

export type TnewsState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  markRead(id: string, ts?: number): void
  markHidden(id: string, ts?: number): void
  filterVisible(items: ReadonlyArray<TnewsItem>): TnewsItem[]
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createTnewsState(): TnewsState {
  const itemState: ItemState<string> = createItemState<string>({
    storageKey: STATE_KEY('tnews'),
    ttlMs: STATE_TTL,
    oldStorageKey: 'gm:tnews:topic-state',
  })
  const expandedAt = new Map<string, number>()

  return {
    isRead(id) {
      return itemState.isRead(id)
    },
    isHidden(id) {
      return itemState.isHidden(id)
    },
    markRead(id, ts) {
      itemState.markRead(id, ts)
    },
    markHidden(id, ts) {
      itemState.markHidden(id, ts)
    },
    filterVisible(items) {
      return itemState.filterVisible(items)
    },
    isExpanded(id) {
      return expandedAt.has(id)
    },
    toggleExpanded(id) {
      if (expandedAt.has(id)) {
        expandedAt.delete(id)
        return false
      }
      expandedAt.set(id, Date.now())
      return true
    },
    setExpanded(id, expanded) {
      if (expanded) expandedAt.set(id, Date.now())
      else expandedAt.delete(id)
    },
    async loadFromStorage(runtime) {
      await itemState.loadFromStorage(runtime)
    },
    async saveToStorage(runtime) {
      await itemState.saveToStorage(runtime)
    },
    async removeFromCache(runtime, id) {
      await removeItemFromCacheById<TnewsItem>(runtime, 'tnews', id)
    },
    clear() {
      itemState.clear()
      expandedAt.clear()
    },
  }
}
