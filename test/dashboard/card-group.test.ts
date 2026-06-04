import { describe, expect, test } from 'bun:test'
import { buildCardGroups } from '../../src/dashboard/card-group'
import type { Source } from '../../src/dashboard/sources/types'

function source(id: string, overrides: Partial<Source<unknown>> = {}): Source<unknown> {
  return {
    id,
    title: id,
    ttlMs: 60_000,
    fetch: () => Promise.resolve(null),
    render: () => {},
    ...overrides,
  }
}

describe('buildCardGroups', () => {
  test('groups sources sharing a groupId, sorted by order', () => {
    const groups = buildCardGroups([
      source('novels', { groupId: 'browse', order: 1 }),
      source('weather', { placement: 'side' }),
      source('v2ex', { groupId: 'browse', order: 0 }),
    ])
    expect(groups.map((g) => g.id)).toEqual(['browse', 'weather'])
    const browse = groups[0]!
    expect(browse.tabs.map((t) => t.id)).toEqual(['v2ex', 'novels'])
    expect(browse.placement).toBe('main')
    expect(groups[1]!.tabs).toHaveLength(1)
    expect(groups[1]!.placement).toBe('side')
  })

  test('uses first source placement when group has no explicit placement', () => {
    const groups = buildCardGroups([
      source('a', { groupId: 'g' }),
      source('b', { groupId: 'g', placement: 'side' }),
    ])
    expect(groups[0]!.placement).toBe('main')
  })

  test('singletons become single-tab groups keyed by source id', () => {
    const groups = buildCardGroups([source('solo')])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.id).toBe('solo')
    expect(groups[0]!.tabs).toHaveLength(1)
  })

  test('empty input produces no groups', () => {
    expect(buildCardGroups([])).toEqual([])
  })
})
