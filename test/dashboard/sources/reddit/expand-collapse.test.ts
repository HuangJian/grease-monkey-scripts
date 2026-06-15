import { describe, expect, test } from 'bun:test'
import {
  COLLAPSE_THRESHOLD,
  MAX_EXPANDED,
  createExpandCollapse,
} from '../../../../src/dashboard/expand-collapse'

describe('createExpandCollapse', () => {
  test('returns all as active when totalPosts <= threshold', () => {
    const ec = createExpandCollapse()
    expect(ec.activeCategories(['a', 'b', 'c'], 0).size).toBe(3)
    expect(ec.activeCategories(['a', 'b', 'c'], 10).size).toBe(3)
    expect(ec.activeCategories(['a', 'b', 'c'], COLLAPSE_THRESHOLD).size).toBe(3)
  })

  test('returns first MAX_EXPANDED as active on first call', () => {
    const ec = createExpandCollapse()
    const active = ec.activeCategories(['a', 'b', 'c', 'd', 'e'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })

  test('toggleCategory expands a collapsed item', () => {
    const ec = createExpandCollapse()
    ec.activeCategories(['a', 'b', 'c'], 25)
    ec.toggleCategory('c', 25)
    const active = ec.activeCategories(['a', 'b', 'c'], 25)
    expect([...active]).toEqual(['a', 'b', 'c'])
  })

  test('toggleCategory collapses an expanded item', () => {
    const ec = createExpandCollapse()
    ec.activeCategories(['a', 'b', 'c'], 25)
    ec.toggleCategory('a', 25)
    const active = ec.activeCategories(['a', 'b', 'c'], 25)
    expect([...active]).toEqual(['b'])
  })

  test('toggleCategory is a no-op when totalPosts <= threshold', () => {
    const ec = createExpandCollapse()
    ec.toggleCategory('a', 5)
    expect(ec.activeCategories(['a', 'b'], 5).size).toBe(2)
  })

  test('reset clears expanded state', () => {
    const ec = createExpandCollapse()
    ec.activeCategories(['a', 'b', 'c'], 25)
    ec.toggleCategory('c', 25)
    ec.reset()
    const active = ec.activeCategories(['a', 'b', 'c', 'd', 'e'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })

  test('MAX_EXPANDED is 2 by default', () => {
    expect(MAX_EXPANDED).toBe(2)
  })

  test('COLLAPSE_THRESHOLD is 20 by default', () => {
    expect(COLLAPSE_THRESHOLD).toBe(20)
  })
})
