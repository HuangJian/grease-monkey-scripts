/**
 * Reddit expand/collapse - re-exports from shared utility.
 *
 * This module re-exports the shared expand/collapse state machine
 * with reddit-specific method names for backward compatibility.
 */
import {
  createExpandCollapse as createExpandCollapseBase,
  COLLAPSE_THRESHOLD,
  MAX_EXPANDED,
  type ExpandCollapseOptions,
} from '../expand-collapse'

export { COLLAPSE_THRESHOLD, MAX_EXPANDED }
export type { ExpandCollapseOptions }

/** Reddit-specific expand/collapse interface with sub-oriented methods. */
export type ExpandCollapse = {
  activeSubs(allSubs: ReadonlyArray<string>, totalPosts: number): Set<string>
  toggleSub(sub: string, totalPosts: number): void
  reset(): void
}

/**
 * Create a reddit expand/collapse state machine.
 *
 * Wraps the shared utility with reddit-specific method names
 * for backward compatibility.
 */
export function createExpandCollapse(): ExpandCollapse {
  const base = createExpandCollapseBase<string>()

  return {
    activeSubs: base.activeCategories,
    toggleSub: base.toggleCategory,
    reset: base.reset,
  }
}
