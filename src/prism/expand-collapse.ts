/**
 * Shared expand/collapse state machine.
 *
 * Manages which categories (boards, subs) are expanded when the total
 * post count exceeds a threshold.
 */

export const COLLAPSE_THRESHOLD = 20
export const MAX_EXPANDED = 2

export interface ExpandCollapseOptions {
  /** Number of posts above which categories collapse. Default: 20 */
  threshold?: number
  /** Maximum categories expanded by default. Default: 2 */
  maxExpanded?: number
}

export interface ExpandCollapse<T extends string = string> {
  /** Returns the set of currently active (expanded) categories. */
  activeCategories(allCategories: ReadonlyArray<T>, totalPosts: number): Set<T>
  /** Toggles a category between expanded and collapsed. */
  toggleCategory(category: T, totalPosts: number): void
  /** Resets to initial state. */
  reset(): void
}

/**
 * Create an expand/collapse state machine.
 *
 * When totalPosts <= threshold, all categories are active.
 * Otherwise, only explicitly toggled categories are active,
 * with maxExpanded categories expanded by default.
 */
export function createExpandCollapse<T extends string = string>(
  options?: ExpandCollapseOptions,
): ExpandCollapse<T> {
  const threshold = options?.threshold ?? COLLAPSE_THRESHOLD
  const maxExpanded = options?.maxExpanded ?? MAX_EXPANDED
  const expanded = new Set<T>()
  let initialized = false

  return {
    activeCategories(allCategories, totalPosts) {
      if (totalPosts <= threshold) return new Set(allCategories)
      if (!initialized) {
        initialized = true
        allCategories.slice(0, maxExpanded).forEach((cat) => expanded.add(cat))
      }
      return new Set(expanded)
    },
    toggleCategory(category, totalPosts) {
      if (totalPosts <= threshold) return
      if (expanded.has(category)) expanded.delete(category)
      else expanded.add(category)
    },
    reset() {
      expanded.clear()
      initialized = false
    },
  }
}
