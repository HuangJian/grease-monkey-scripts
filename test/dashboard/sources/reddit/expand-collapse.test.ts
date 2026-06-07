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
  test('returns first MAX_EXPANDED subs as active when totalPosts > threshold and no history', () => {
    const ec = createExpandCollapse()
    const active = ec.activeSubs(['a', 'b', 'c', 'd', 'e'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })
  test('returns the last MAX_EXPANDED entries from the LRU order when there is history', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 25)
    ec.toggleSub('b', 25)
    const active = ec.activeSubs(['a', 'b', 'c', 'd', 'e'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })
  test('toggleSub is a no-op when totalPosts <= threshold', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 5)
    expect(ec.activeSubs(['a', 'b'], 5).size).toBe(2)
  })
  test('toggleSub sets touched flag, breaking out of default mode', () => {
    const ec = createExpandCollapse()
    expect([...ec.activeSubs(['a', 'b', 'c'], 25)]).toEqual(['a', 'b'])
    ec.toggleSub('c', 25)
    expect([...ec.activeSubs(['a', 'b', 'c'], 25)]).toEqual(['c'])
  })
  test('toggleSub adds sub to LRU when expanding', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 25)
    ec.toggleSub('b', 25)
    const active = ec.activeSubs(['a', 'b', 'c', 'd'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })
  test('toggleSub evicts the oldest entry when exceeding MAX_EXPANDED', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 25)
    ec.toggleSub('b', 25)
    ec.toggleSub('c', 25)
    const active = ec.activeSubs(['a', 'b', 'c', 'd'], 25)
    expect([...active]).toEqual(['b', 'c'])
  })
  test('toggleSub removes a sub from the LRU when collapsing', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 25)
    ec.toggleSub('b', 25)
    ec.toggleSub('a', 25)
    const active = ec.activeSubs(['a', 'b', 'c'], 25)
    expect([...active]).toEqual(['b'])
  })
  test('touched persists after collapsing all entries (no default re-apply)', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 25)
    ec.toggleSub('b', 25)
    ec.toggleSub('a', 25)
    ec.toggleSub('b', 25)
    expect(ec.activeSubs(['a', 'b', 'c'], 25).size).toBe(0)
  })
  test('reset clears the LRU order and touched flag', () => {
    const ec = createExpandCollapse()
    ec.toggleSub('a', 25)
    ec.toggleSub('b', 25)
    ec.reset()
    const active = ec.activeSubs(['a', 'b', 'c', 'd'], 25)
    expect([...active]).toEqual(['a', 'b'])
  })
  test('MAX_EXPANDED is 2 by default', () => {
    expect(MAX_EXPANDED).toBe(2)
  })
  test('COLLAPSE_THRESHOLD is 20 by default', () => {
    expect(COLLAPSE_THRESHOLD).toBe(20)
  })
})
