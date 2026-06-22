import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

export type RedditState = ItemState<string> & {
  removeFromCache(runtime: Runtime, id: string): Promise<void>
}

export type RedditStateOptions = {
  retentionMs: number
}

export function createRedditState(options: RedditStateOptions): RedditState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('reddit'),
    // 状态保留周期 = 历史主题清理周期 + 1 天（避免 fetch 失败时状态早于数据消失）
    ttlMs: options.retentionMs + 24 * 60 * 60 * 1000,
    oldStorageKey: 'gm:reddit:topic-state',
  })

  return {
    ...itemState,
    async removeFromCache(runtime, id) {
      await removeItemFromCache(runtime, 'reddit', id)
    },
  }
}
