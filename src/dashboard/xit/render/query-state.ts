const queryStates = new WeakMap<HTMLElement, { query: string; error: string | null }>()

export function getQueryState(container: HTMLElement) {
  let state = queryStates.get(container)
  if (!state) {
    state = { query: '', error: null }
    queryStates.set(container, state)
  }
  return state
}
