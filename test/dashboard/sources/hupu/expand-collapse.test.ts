import { describe, expect, test } from 'bun:test'
import {
  createExpandCollapse,
  COLLAPSE_THRESHOLD,
  MAX_EXPANDED,
} from '../../../../src/dashboard/expand-collapse'

describe('createExpandCollapse', () => {
  test('all active when total below threshold', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c']
    expect(ec.activeCategories(all, 10)).toEqual(new Set(all))
  })
  test('only MAX_EXPANDED active when above threshold', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c', 'd']
    const active = ec.activeCategories(all, COLLAPSE_THRESHOLD + 1)
    expect(active.size).toBe(MAX_EXPANDED)
    expect(active.has('a')).toBe(true)
    expect(active.has('b')).toBe(true)
  })
  test('toggleCategory adds/removes', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c', 'd']
    ec.activeCategories(all, COLLAPSE_THRESHOLD + 1)
    ec.toggleCategory('c', COLLAPSE_THRESHOLD + 1)
    const active = ec.activeCategories(all, COLLAPSE_THRESHOLD + 1)
    expect(active.has('c')).toBe(true)
    ec.toggleCategory('c', COLLAPSE_THRESHOLD + 1)
    const active2 = ec.activeCategories(all, COLLAPSE_THRESHOLD + 1)
    expect(active2.has('c')).toBe(false)
  })
  test('reset clears expanded state', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c', 'd']
    ec.activeCategories(all, COLLAPSE_THRESHOLD + 1)
    ec.toggleCategory('c', COLLAPSE_THRESHOLD + 1)
    ec.reset()
    const active = ec.activeCategories(all, COLLAPSE_THRESHOLD + 1)
    expect(active.size).toBe(MAX_EXPANDED)
    expect(active.has('a')).toBe(true)
  })
  test('toggleCategory is no-op below threshold', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b']
    ec.activeCategories(all, 10)
    ec.toggleCategory('a', 10)
    const active = ec.activeCategories(all, 10)
    expect(active).toEqual(new Set(all))
  })
})
