import { STATE_KEY } from '../types'
import type { Runtime } from '../../runtime'
import { createItemState } from '../item-state'
import { removeItemFromCache } from '../browse-state'
import type { RedditPost } from './types'

const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000

export type RedditState = {
  isRead(id: string): boolean
  isHidden(id: string): boolean
  getReadReplies(id: string): number | undefined
  markRead(id: string, ts?: number, replies?: number): void
  markHidden(id: string, ts?: number): void
  filterVisible(posts: ReadonlyArray<RedditPost>): RedditPost[]
  loadFromStorage(runtime: Runtime): Promise<void>
  saveToStorage(runtime: Runtime): Promise<void>
  removeFromCache(runtime: Runtime, id: string): Promise<void>
  clear(): void
}

export function createRedditState(): RedditState {
  const itemState = createItemState<string>({
    storageKey: STATE_KEY('reddit'),
    ttlMs: TOPIC_STATE_TTL,
    oldStorageKey: 'gm:reddit:topic-state',
  })

  return {
    ...(itemState as unknown as RedditState),
    async removeFromCache(runtime, id) {
      await removeItemFromCache(runtime, 'reddit', id)
    },
  }
}
