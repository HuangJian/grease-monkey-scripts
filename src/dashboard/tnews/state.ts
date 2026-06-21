import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, createExpandedState } from '../item-state'
import { removeItemFromCache } from '../browse-state'
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
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('tnews'),
    ttlMs: STATE_TTL,
    oldStorageKey: 'gm:tnews:topic-state',
  })
  const expanded = createExpandedState()

  const base = itemState as unknown as TnewsState
  return {
    ...base,
    ...expanded,
    async removeFromCache(runtime, id) {
      await removeItemFromCache(runtime, 'tnews', id)
    },
    clear() {
      itemState.clear()
      expanded.clear()
    },
  }
}
