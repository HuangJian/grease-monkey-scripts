import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

export type V2exState = ItemState<number> & {
  removeFromCache(runtime: Runtime, topicId: number): Promise<void>
}

export type V2exStateOptions = {
  retentionMs: number
}

export function createV2exState(options: V2exStateOptions): V2exState {
  const itemState = createItemState<number>({
    storageKey: STATE_KEY('v2ex'),
    // 状态保留周期 = 历史主题清理周期 + 1 天
    // 避免网络错误导致 fetch 失败时，pruneExpiredCache 未执行，
    // 但 loadFromStorage 中的 expireNow 已经把状态清理掉，
    // 造成"数据还在、状态已丢"的不一致。
    // 多留 1 天缓冲，确保状态不会早于数据消失。
    ttlMs: options.retentionMs + 24 * 60 * 60 * 1000,
    oldStorageKey: 'gm:v2ex:topic-state',
    serializeId: String,
    deserializeId: Number,
  })

  return {
    ...itemState,
    async removeFromCache(runtime, topicId) {
      await removeItemFromCache(runtime, 'v2ex', topicId)
    },
  }
}
