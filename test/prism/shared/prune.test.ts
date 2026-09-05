import { describe, expect, test } from 'bun:test'
import { pruneGroups, pruneItems } from '../../../src/prism/shared/prune'

interface Item {
  id: number
  created: number
}

const NOW = 10_000
const RET = 1_000

function makeItems(): Item[] {
  return [
    { id: 1, created: NOW - 100 }, // fresh
    { id: 2, created: NOW - RET - 1 }, // expired
    { id: 3, created: 0 }, // unknown timestamp -> expired
  ]
}

describe('shared/prune', () => {
  test('pruneItems keeps fresh and drops expired (including created 0)', () => {
    const { kept, removedIds } = pruneItems({
      items: makeItems(),
      getId: (t) => t.id,
      getCreated: (t) => t.created,
      now: NOW,
      retentionMs: RET,
    })
    expect(kept.map((t) => t.id)).toEqual([1])
    expect(removedIds).toEqual([2, 3])
  })

  test('pruneItems returns no removedIds when nothing expired (early-return signal)', () => {
    const { kept, removedIds } = pruneItems({
      items: [{ id: 1, created: NOW - 100 }],
      getId: (t) => t.id,
      getCreated: (t) => t.created,
      now: NOW,
      retentionMs: RET,
    })
    expect(kept.length).toBe(1)
    expect(removedIds.length).toBe(0)
  })

  test('pruneItems preserves the source id type (number for v2ex)', () => {
    const { removedIds } = pruneItems({
      items: [{ id: 7, created: 0 }],
      getId: (t) => t.id,
      getCreated: (t) => t.created,
      now: NOW,
      retentionMs: RET,
    })
    // number[] must flow through untouched so it plugs into removeEntries<number>
    expect(removedIds).toEqual([7])
    expect(typeof removedIds[0]).toBe('number')
  })

  test('pruneGroups drops fully-expired groups and flips changed', () => {
    const data: Record<string, Item[]> = {
      alive: [
        { id: 1, created: NOW - 100 },
        { id: 2, created: NOW - RET - 1 },
      ],
      dead: [{ id: 3, created: NOW - RET - 5 }],
    }
    const { kept, removedIds, changed } = pruneGroups(
      data,
      (t) => String(t.id),
      (t) => t.created,
      NOW,
      RET,
    )
    expect(Object.keys(kept)).toEqual(['alive'])
    expect(kept.alive!.map((t) => t.id)).toEqual([1])
    expect(removedIds).toEqual(['2', '3'])
    expect(changed).toBe(true)
  })

  test('pruneGroups reports changed=false when nothing expired', () => {
    const data: Record<string, Item[]> = {
      a: [{ id: 1, created: NOW - 100 }],
    }
    const { changed, removedIds } = pruneGroups(
      data,
      (t) => String(t.id),
      (t) => t.created,
      NOW,
      RET,
    )
    expect(changed).toBe(false)
    expect(removedIds.length).toBe(0)
  })
})
