import type { Runtime } from '../../runtime'
import { STATE_KEY } from '../types'
import { createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

export type V2exState = ItemState<number> & {
  removeFromCache(runtime: Runtime, topicId: number): Promise<void>
}

export function createV2exState(): V2exState {
  const itemState = createItemState<number>({
    storageKey: STATE_KEY('v2ex'),
    ttlMs: 72 * 60 * 60 * 1000,
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
