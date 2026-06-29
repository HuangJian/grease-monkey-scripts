import { useEffect, useState } from 'preact/hooks'

/**
 * A minimal reactive store for header state shared between `RenderHeader` and
 * `RenderComponent`.
 *
 * Usage in a source factory:
 * ```ts
 * const store = createHeaderState({ activeIndex: 0 })
 *
 * RenderHeader: (props) => {
 *   const hs = useHeaderState(store)
 *   return <Header activeIndex={hs.activeIndex}
 *     onTabChange={(i) => store.set(s => ({ ...s, activeIndex: i }))} />
 * },
 * RenderComponent: (props) => {
 *   const hs = useHeaderState(store)
 *   return <Body activeIndex={hs.activeIndex} />
 * },
 * ```
 */
export type HeaderStateStore<S> = {
  get: () => S
  set: (updater: (prev: S) => S) => void
  subscribe: (fn: () => void) => () => void
}

export function createHeaderState<S>(initial: S): HeaderStateStore<S> {
  let state = initial
  const subscribers = new Set<() => void>()
  return {
    get: () => state,
    set: (updater) => {
      state = updater(state)
      for (const fn of subscribers) fn()
    },
    subscribe: (fn) => {
      subscribers.add(fn)
      return () => {
        subscribers.delete(fn)
      }
    },
  }
}

/**
 * Subscribe a component to a `HeaderStateStore`.  The component re-renders
 * whenever `store.set()` is called.
 */
export function useHeaderState<S>(store: HeaderStateStore<S>): S {
  const [state, setState] = useState(store.get)
  useEffect(() => {
    const unsubscribe = store.subscribe(() => setState(store.get()))
    // Sync in case the store changed between initial render and effect.
    setState(store.get())
    return unsubscribe
  }, [store])
  return state
}
