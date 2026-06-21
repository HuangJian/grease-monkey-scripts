import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, createExpandedState } from '../item-state'

const STATE_TTL = 72 * 60 * 60 * 1000

export type XueqiuState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  markRead(id: string, ts?: number): void
  markHidden(id: string, ts?: number): void
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  filterVisible<T extends { id: number | string }>(items: ReadonlyArray<T>): T[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createXueqiuState(): XueqiuState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('xueqiu'),
    ttlMs: STATE_TTL,
  })
  const expanded = createExpandedState()

  const base = itemState as unknown as XueqiuState
  return {
    ...base,
    ...expanded,
    filterVisible(items) {
      return itemState.filterVisible(items.map((it) => ({ ...it, id: String(it.id) })))
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
