export const COLLAPSE_THRESHOLD = 20
export const MAX_EXPANDED = 2

export type ExpandCollapse = {
  activeSubs(allSubs: ReadonlyArray<string>, totalPosts: number): Set<string>
  toggleSub(sub: string, totalPosts: number): void
  reset(): void
}

export function createExpandCollapse(): ExpandCollapse {
  const expanded = new Set<string>()
  let initialized = false

  return {
    activeSubs(allSubs, totalPosts) {
      if (totalPosts <= COLLAPSE_THRESHOLD) return new Set(allSubs)
      if (!initialized) {
        initialized = true
        for (const s of allSubs.slice(0, MAX_EXPANDED)) expanded.add(s)
      }
      return new Set(expanded)
    },
    toggleSub(sub, totalPosts) {
      if (totalPosts <= COLLAPSE_THRESHOLD) return
      if (expanded.has(sub)) expanded.delete(sub)
      else expanded.add(sub)
    },
    reset() {
      expanded.clear()
      initialized = false
    },
  }
}
