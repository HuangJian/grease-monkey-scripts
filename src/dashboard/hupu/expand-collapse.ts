export const COLLAPSE_THRESHOLD = 20
export const MAX_EXPANDED = 2

export type ExpandCollapse = {
  activeBoards(allBoards: ReadonlyArray<string>, totalPosts: number): Set<string>
  toggleBoard(board: string, totalPosts: number): void
  reset(): void
}

export function createExpandCollapse(): ExpandCollapse {
  const expanded = new Set<string>()
  let initialized = false

  return {
    activeBoards(allBoards, totalPosts) {
      if (totalPosts <= COLLAPSE_THRESHOLD) return new Set(allBoards)
      if (!initialized) {
        initialized = true
        for (const s of allBoards.slice(0, MAX_EXPANDED)) expanded.add(s)
      }
      return new Set(expanded)
    },
    toggleBoard(board, totalPosts) {
      if (totalPosts <= COLLAPSE_THRESHOLD) return
      if (expanded.has(board)) expanded.delete(board)
      else expanded.add(board)
    },
    reset() {
      expanded.clear()
      initialized = false
    },
  }
}
