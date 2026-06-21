import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000

export type RedditState = ItemState<string> & {
  removeFromCache(runtime: Runtime, id: string): Promise<void>
}

export function createRedditState(): RedditState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('reddit'),
    ttlMs: TOPIC_STATE_TTL,
    oldStorageKey: 'gm:reddit:topic-state',
  })

  return {
    ...itemState,
    async removeFromCache(runtime, id) {
      await removeItemFromCache(runtime, 'reddit', id)
    },
  }
}
