import { describe, expect, test } from 'bun:test'
import {
  createExpandCollapse,
  COLLAPSE_THRESHOLD,
  MAX_EXPANDED,
} from '../../../../src/dashboard/hupu/expand-collapse'

describe('createExpandCollapse', () => {
  test('all boards active when total below threshold', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c']
    expect(ec.activeBoards(all, 10)).toEqual(new Set(all))
  })
  test('only MAX_EXPANDED boards active when above threshold', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c', 'd']
    const active = ec.activeBoards(all, COLLAPSE_THRESHOLD + 1)
    expect(active.size).toBe(MAX_EXPANDED)
    expect(active.has('a')).toBe(true)
    expect(active.has('b')).toBe(true)
  })
  test('toggleBoard adds/removes board', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c', 'd']
    ec.activeBoards(all, COLLAPSE_THRESHOLD + 1)
    ec.toggleBoard('c', COLLAPSE_THRESHOLD + 1)
    const active = ec.activeBoards(all, COLLAPSE_THRESHOLD + 1)
    expect(active.has('c')).toBe(true)
    ec.toggleBoard('c', COLLAPSE_THRESHOLD + 1)
    const active2 = ec.activeBoards(all, COLLAPSE_THRESHOLD + 1)
    expect(active2.has('c')).toBe(false)
  })
  test('reset clears expanded state', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b', 'c', 'd']
    ec.activeBoards(all, COLLAPSE_THRESHOLD + 1)
    ec.toggleBoard('c', COLLAPSE_THRESHOLD + 1)
    ec.reset()
    const active = ec.activeBoards(all, COLLAPSE_THRESHOLD + 1)
    expect(active.size).toBe(MAX_EXPANDED)
    expect(active.has('a')).toBe(true)
  })
  test('toggleBoard is no-op below threshold', () => {
    const ec = createExpandCollapse()
    const all = ['a', 'b']
    ec.activeBoards(all, 10)
    ec.toggleBoard('a', 10)
    const active = ec.activeBoards(all, 10)
    expect(active).toEqual(new Set(all))
  })
})
