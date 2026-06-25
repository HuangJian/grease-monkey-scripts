import type { Runtime } from '../runtime'

export type ItemHandlerState<T extends { id: string | number }> = {
  markHidden(id: T['id']): void
  markRead(id: T['id'], ts?: number, replies?: number): void
  saveToStorage(runtime: Runtime): Promise<void>
  removeFromCache(runtime: Runtime, id: T['id']): Promise<void>
  isRead(id: T['id']): boolean
  filterVisible(items: ReadonlyArray<T>): T[]
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
  handleBulkHide: (hovered: T) => void
} {
  const { state, runtime, forceUpdate, getVisible, repliesOf } = opts

  function handleHide(id: T['id']) {
    state.markHidden(id)
    void state.saveToStorage(runtime)
    void state.removeFromCache(runtime, id)
    forceUpdate()
  }

  function handleBulkRead(hovered: T) {
    const visible = getVisible()
    const idx = visible.findIndex((it) => it.id === hovered.id)
    if (idx < 0) return
    const now = Date.now()
    visible
      .slice(0, idx + 1)
      .filter((it) => !state.isRead(it.id))
      .forEach((it) => {
        state.markRead(it.id, now, repliesOf?.(it))
      })
    void state.saveToStorage(runtime)
    forceUpdate()
  }

  function handleBulkHide(hovered: T) {
    const visible = getVisible()
    const idx = visible.findIndex((it) => it.id === hovered.id)
    if (idx < 0) return
    visible.slice(0, idx + 1).forEach((it) => {
      state.markHidden(it.id)
      void state.removeFromCache(runtime, it.id)
    })
    void state.saveToStorage(runtime)
    forceUpdate()
  }

  return { handleHide, handleBulkRead, handleBulkHide }
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
  handleBulkHide: (hovered: T) => void
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
    const posts = getVisibleInSub(sub)
    const idx = posts.findIndex((p) => p.id === hovered.id)
    if (idx < 0) return
    const now = Date.now()
    posts
      .slice(0, idx + 1)
      .filter((p) => !state.isRead(p.id))
      .forEach((p) => {
        state.markRead(p.id, now, repliesOf?.(p))
      })
    void state.saveToStorage(runtime)
    forceUpdate()
  }

  function handleBulkHide(hovered: T) {
    const sub = getSubForItem(hovered)
    if (sub === null) return
    const posts = getVisibleInSub(sub)
    const idx = posts.findIndex((p) => p.id === hovered.id)
    if (idx < 0) return
    posts.slice(0, idx + 1).forEach((p) => {
      state.markHidden(p.id)
      void state.removeFromCache(runtime, p.id)
    })
    void state.saveToStorage(runtime)
    forceUpdate()
  }

  return { handleHide, handleBulkRead, handleBulkHide }
}
