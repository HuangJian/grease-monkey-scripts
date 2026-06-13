import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, type ItemState } from '../item-state'

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
  const itemState: ItemState<string> = createItemState<string>({
    storageKey: STATE_KEY('xueqiu'),
    ttlMs: STATE_TTL,
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
    filterVisible(items) {
      return itemState.filterVisible(items.map((it) => ({ ...it, id: String(it.id) })))
    },
    async loadFromStorage(runtime) {
      await itemState.loadFromStorage(runtime)
    },
    async saveToStorage(runtime) {
      await itemState.saveToStorage(runtime)
    },
    async removeFromCache(_runtime, _id) {
      // handled by source.tsx filterVisible
    },
    clear() {
      itemState.clear()
      expandedAt.clear()
    },
  }
}
