import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, createExpandedState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

export type TnewsState = ItemState<string> & {
  isExpanded(id: string): boolean
  toggleExpanded(id: string): boolean
  setExpanded(id: string, expanded: boolean): void
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export type TnewsStateOptions = {
  retentionMs: number
}

export function createTnewsState(options: TnewsStateOptions): TnewsState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('tnews'),
    // 状态保留周期 = 历史主题清理周期 + 1 天（避免 fetch 失败时状态早于数据消失）
    ttlMs: options.retentionMs + 24 * 60 * 60 * 1000,
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
