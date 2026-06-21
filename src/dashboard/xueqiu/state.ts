import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, createExpandedState, type ItemState } from '../item-state'

const STATE_TTL = 72 * 60 * 60 * 1000

export type XueqiuState = ItemState<string> & {
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  filterVisible<T extends { id: number | string }>(items: ReadonlyArray<T>): T[]
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createXueqiuState(): XueqiuState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('xueqiu'),
    ttlMs: STATE_TTL,
  })
  const expanded = createExpandedState()

  return {
    ...itemState,
    ...expanded,
    filterVisible<T extends { id: number | string }>(items: ReadonlyArray<T>) {
      return itemState.filterVisible(items.map((it) => ({ ...it, id: String(it.id) }))) as T[]
    },
    async removeFromCache(_runtime, _id) {
      // handled by source.tsx filterVisible
    },
    clear() {
      itemState.clear()
      expanded.clear()
    },
  }
}
