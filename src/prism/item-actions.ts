import type { Runtime } from '../runtime'

export type ItemHandlerState<T extends { id: string | number }> = {
  markHidden(id: T['id']): void
  markRead(id: T['id'], ts?: number, replies?: number): void
  saveToStorage(runtime: Runtime): Promise<void>
  removeFromCache(runtime: Runtime, id: T['id']): Promise<void>
  isRead(id: T['id']): boolean
  filterVisible(items: ReadonlyArray<T>): T[]
}

/**
 * The entries `handleBulkRead` touches: this one and everything above it in the
 * (newest-first) list, minus what is already read. `null` when `hovered` is not
 * in the list at all — the button is then a no-op, and the preview empty.
 *
 * Exposed via `previewBulkRead` so hovering the button can show its reach before
 * committing — the reach is otherwise invisible, and the button is destructive
 * enough that counting rows should not be the way to find out.
 */
function bulkReadTargets<T extends { id: string | number }>(
  visible: ReadonlyArray<T>,
  hovered: T,
  isRead: (id: T['id']) => boolean,
): T[] | null {
  const idx = visible.findIndex((it) => it.id === hovered.id)
  if (idx < 0) return null
  return visible.slice(0, idx + 1).filter((it) => !isRead(it.id))
}

export function createItemHandlers<T extends { id: string | number }>(opts: {
  state: ItemHandlerState<T>
  runtime: Runtime
  forceUpdate: () => void
  getVisible: () => T[]
  repliesOf?: (item: T) => number | undefined
}): {
  handleHide: (id: T['id']) => void
  handleBulkRead: (hovered: T) => void
  previewBulkRead: (hovered: T) => T[]
} {
  const { state, runtime, forceUpdate, getVisible, repliesOf } = opts

  function handleHide(id: T['id']) {
    state.markHidden(id)
    void state.saveToStorage(runtime)
    void state.removeFromCache(runtime, id)
    forceUpdate()
  }

  function handleBulkRead(hovered: T) {
    const targets = bulkReadTargets(getVisible(), hovered, (id) => state.isRead(id))
    if (!targets) return
    const now = runtime.now()
    targets.forEach((it) => {
      state.markRead(it.id, now, repliesOf?.(it))
    })
    void state.saveToStorage(runtime)
    forceUpdate()
  }

  return {
    handleHide,
    handleBulkRead,
    previewBulkRead: (hovered) =>
      bulkReadTargets(getVisible(), hovered, (id) => state.isRead(id)) ?? [],
  }
}

export function createGroupedItemHandlers<
  T extends { id: string | number },
  G extends string = string,
>(opts: {
  state: ItemHandlerState<T>
  runtime: Runtime
  forceUpdate: () => void
  getSubForItem: (item: T) => G | null
  getVisibleInSub: (sub: G) => T[]
  repliesOf?: (item: T) => number | undefined
}): {
  handleHide: (id: T['id']) => void
  handleBulkRead: (hovered: T) => void
  previewBulkRead: (hovered: T) => T[]
} {
  const { state, runtime, forceUpdate, getSubForItem, getVisibleInSub, repliesOf } = opts

  function handleHide(id: T['id']) {
    state.markHidden(id)
    void state.saveToStorage(runtime)
    void state.removeFromCache(runtime, id)
    forceUpdate()
  }

  function handleBulkRead(hovered: T) {
    const sub = getSubForItem(hovered)
    if (sub === null) return
    const targets = bulkReadTargets(getVisibleInSub(sub), hovered, (id) => state.isRead(id))
    if (!targets) return
    const now = runtime.now()
    targets.forEach((p) => {
      state.markRead(p.id, now, repliesOf?.(p))
    })
    void state.saveToStorage(runtime)
    forceUpdate()
  }

  return {
    handleHide,
    handleBulkRead,
    previewBulkRead: (hovered) => {
      const sub = getSubForItem(hovered)
      if (sub === null) return []
      return bulkReadTargets(getVisibleInSub(sub), hovered, (id) => state.isRead(id)) ?? []
    },
  }
}
