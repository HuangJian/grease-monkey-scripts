import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

export type HupuState = ItemState<string> & {
  removeFromCache(runtime: Runtime, id: string): Promise<void>
}

export type HupuStateOptions = {
  retentionMs: number
}

export function createHupuState(options: HupuStateOptions): HupuState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('hupu'),
    // 状态保留周期 = 历史主题清理周期 + 1 天（避免 fetch 失败时状态早于数据消失）
    ttlMs: options.retentionMs + 24 * 60 * 60 * 1000,
  })

  return {
    ...itemState,
    async removeFromCache(runtime, id) {
      await removeItemFromCache(runtime, 'hupu', id)
    },
  }
}
