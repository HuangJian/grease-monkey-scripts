import { describe, expect, test } from 'bun:test'
import {
  defaultLabels,
  getAuthorLabel,
  getAuthorRecord,
} from '../../src/v2ex-time-saver/author-labels'
import type { AuthorMap } from '../../src/v2ex-time-saver/types'

function parseAuthorMap(value: string | null): AuthorMap {
  if (!value) {
    return new Map()
  }
  return new Map(JSON.parse(value))
}

describe('author labels', () => {
  test('supports legacy string records and per-author labels', () => {
    const map = parseAuthorMap(
      JSON.stringify([
        ['legacy', 'https://www.v2ex.com/t/1#2'],
        ['labeled', { url: 'https://www.v2ex.com/t/2#3', label: '智者' }],
      ]),
    )

    expect(getAuthorRecord(map, 'legacy')).toEqual({ url: 'https://www.v2ex.com/t/1#2' })
    expect(getAuthorLabel(map, 'legacy', defaultLabels.shame)).toBe(defaultLabels.shame)
    expect(getAuthorLabel(map, 'labeled', defaultLabels.thank)).toBe('智者')
  })
})
