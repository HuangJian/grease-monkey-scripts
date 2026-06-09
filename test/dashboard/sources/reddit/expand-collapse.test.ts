import { describe, expect, test } from 'bun:test'
import {
  COLLAPSE_THRESHOLD,
  MAX_EXPANDED,
  createExpandCollapse,
} from '../../../../src/dashboard/reddit/expand-collapse'

describe('createExpandCollapse', () => {
  test('returns all subs as active when totalPosts <= threshold', () => {
    const ec = createExpandCollapse()
    expect(ec.activeSubs(['a', 'b', 'c'], 0).size).toBe(3)
    expect(ec.activeSubs(['a', 'b', 'c'], 10).size).toBe(3)
    expect(ec.activeSubs(['a', 'b', 'c'], COLLAPSE_THRESHOLD).size).toBe(3)
  })

  test('returns first MAX_EXPANDED subs as active on first call', () => {
    const ec = createExpandCollapse()
    const active = ec.activeSubs(['a', 'b', 'c', 'd', 'e'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })

  test('toggleSub expands a collapsed sub', () => {
    const ec = createExpandCollapse()
    ec.activeSubs(['a', 'b', 'c'], 25)
    ec.toggleSub('c', 25)
    const active = ec.activeSubs(['a', 'b', 'c'], 25)
    expect([...active]).toEqual(['a', 'b', 'c'])
  })

  test('toggleSub collapses an expanded sub', () => {
    const ec = createExpandCollapse()
    ec.activeSubs(['a', 'b', 'c'], 25)
    ec.toggleSub('a', 25)
    const active = ec.activeSubs(['a', 'b', 'c'], 25)
    expect([...active]).toEqual(['b'])
  })

  test('toggleSub is a no-op when totalPosts <= threshold', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 5)
    expect(ec.activeSubs(['a', 'b'], 5).size).toBe(2)
  })

  test('reset clears expanded state', () => {
    const ec = createExpandCollapse()
    ec.activeSubs(['a', 'b', 'c'], 25)
    ec.toggleSub('c', 25)
    ec.reset()
    const active = ec.activeSubs(['a', 'b', 'c', 'd', 'e'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })

  test('MAX_EXPANDED is 2 by default', () => {
    expect(MAX_EXPANDED).toBe(2)
  })

  test('COLLAPSE_THRESHOLD is 20 by default', () => {
    expect(COLLAPSE_THRESHOLD).toBe(20)
  })
})
