import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, createExpandedState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

const STATE_TTL = 7 * 24 * 60 * 60 * 1000

export type TnewsState = ItemState<string> & {
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
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

  return {
    ...itemState,
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
