import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState, type ItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'

export type RedditState = ItemState<string> & {
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  /** Index of the section the next fetch should cover (see reddit-feed-rotation.plan.md). */
  currentGroup(runtime: Runtime, groupCount: number): Promise<number>
  /**
   * Move the cursor to the next section. Call this only **after** a successful
   * fetch: a failed round must retry the same section instead of silently
   * skipping it for a whole cycle.
   */
  advanceGroup(runtime: Runtime, groupCount: number): Promise<void>
}

/** Separate key from the item state: the cursor is not a read/seen record. */
const GROUP_STORAGE_KEY = STATE_KEY('reddit') + ':group'

async function readGroup(runtime: Runtime, groupCount: number): Promise<number> {
  if (groupCount <= 1) return 0
  const raw = await runtime.getValue<unknown>(GROUP_STORAGE_KEY, 0)
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 0
  // A shrunken section list must not point past the end of the new array.
  return ((n % groupCount) + groupCount) % groupCount
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
    async currentGroup(runtime, groupCount) {
      return readGroup(runtime, groupCount)
    },
    async advanceGroup(runtime, groupCount) {
      if (groupCount <= 1) return
      const current = await readGroup(runtime, groupCount)
      await runtime.setValue(GROUP_STORAGE_KEY, (current + 1) % groupCount)
    },
  }
}
