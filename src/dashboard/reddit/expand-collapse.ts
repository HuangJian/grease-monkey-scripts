export const COLLAPSE_THRESHOLD = 20
export const MAX_EXPANDED = 2

export type ExpandCollapse = {
  activeSubs(allSubs: ReadonlyArray<string>, totalPosts: number): Set<string>
  toggleSub(sub: string, totalPosts: number): void
  reset(): void
}

export function createExpandCollapse(): ExpandCollapse {
  const order: string[] = []
  let touched = false
  return {
    activeSubs(allSubs, totalPosts) {
      if (totalPosts <= COLLAPSE_THRESHOLD) return new Set(allSubs)
      if (!touched) {
        return new Set(allSubs.slice(0, MAX_EXPANDED))
      }
      return new Set(order.slice(-MAX_EXPANDED))
    },
    toggleSub(sub, totalPosts) {
      if (totalPosts <= COLLAPSE_THRESHOLD) return
      touched = true
      const idx = order.indexOf(sub)
      if (idx >= 0) {
        order.splice(idx, 1)
        return
      }
      order.push(sub)
      while (order.length > MAX_EXPANDED) order.shift()
    },
    reset() {
      order.length = 0
      touched = false
    },
  }
}
