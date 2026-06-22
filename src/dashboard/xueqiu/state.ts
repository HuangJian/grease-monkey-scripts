import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, createExpandedState, type ItemState } from '../item-state'

export type XueqiuState = ItemState<string> & {
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  filterVisible<T extends { id: number | string }>(items: ReadonlyArray<T>): T[]
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export type XueqiuStateOptions = {
  retentionMs: number
}

export function createXueqiuState(options: XueqiuStateOptions): XueqiuState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('xueqiu'),
    // 状态保留周期 = 历史主题清理周期 + 1 天（避免 fetch 失败时状态早于数据消失）
    ttlMs: options.retentionMs + 24 * 60 * 60 * 1000,
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
