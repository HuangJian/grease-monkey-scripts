import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000

export type HupuState = ItemState<string> & {
  removeFromCache(runtime: Runtime, id: string): Promise<void>
}

export function createHupuState(): HupuState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('hupu'),
    ttlMs: TOPIC_STATE_TTL,
  })

  return {
    ...itemState,
    async removeFromCache(runtime, id) {
      await removeItemFromCache(runtime, 'hupu', id)
    },
  }
}
