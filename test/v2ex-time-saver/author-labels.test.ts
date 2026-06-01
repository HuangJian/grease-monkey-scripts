import { describe, expect, test } from 'bun:test'
import {
  addTag,
  authorTagsKeyword,
  getAuthorTags,
  getTotalScore,
  incrementTagScore,
  parseAuthorTagMap,
  removeTag,
  toRelativeUrl,
} from '../../src/v2ex-time-saver/author-labels'
import type { AuthorTagMap } from '../../src/v2ex-time-saver/author-labels'

describe('toRelativeUrl', () => {
  test('strips origin and leading slash, keeps path + hash', () => {
    expect(toRelativeUrl('https://www.v2ex.com/t/820234#0')).toBe('t/820234#0')
    expect(toRelativeUrl('https://www.v2ex.com/t/820234')).toBe('t/820234')
  })

  test('returns input unchanged when not a valid URL', () => {
    expect(toRelativeUrl('not-a-url')).toBe('not-a-url')
  })
})

describe('getTotalScore', () => {
  test('returns 0 for undefined or empty', () => {
    expect(getTotalScore(undefined)).toBe(0)
    expect(getTotalScore({})).toBe(0)
  })

  test('sums all tag scores', () => {
    expect(
      getTotalScore({
        A: { url: 't/1', score: 3 },
        B: { url: 't/2', score: -1 },
        C: { url: 't/3', score: 0 },
      }),
    ).toBe(2)
  })
})

describe('addTag / removeTag / incrementTagScore', () => {
  test('addTag creates a new entry under a fresh author', () => {
    const map: AuthorTagMap = {}
    addTag(map, 'alice', '若婴', 't/1', -1)
    expect(map.alice).toEqual({ 若婴: { url: 't/1', score: -1 } })
  })

  test('addTag ignores empty tag text', () => {
    const map: AuthorTagMap = {}
    addTag(map, 'alice', '  ', 't/1', -1)
    expect(map.alice).toBeUndefined()
  })

  test('addTag overwrites an existing tag of the same name', () => {
    const map: AuthorTagMap = { alice: { 若婴: { url: 't/1', score: -1 } } }
    addTag(map, 'alice', '若婴', 't/2', -2)
    expect(map.alice.若婴).toEqual({ url: 't/2', score: -2 })
  })

  test('incrementTagScore adds delta to existing tag', () => {
    const map: AuthorTagMap = { alice: { 智者: { url: 't/1', score: 1 } } }
    incrementTagScore(map, 'alice', '智者', 't/1', 1)
    expect(map.alice.智者.score).toBe(2)
  })

  test('incrementTagScore creates a new tag if missing', () => {
    const map: AuthorTagMap = {}
    incrementTagScore(map, 'alice', '智者', 't/1', 1)
    expect(map.alice.智者).toEqual({ url: 't/1', score: 1 })
  })

  test('removeTag deletes the tag and the author entry if no tags remain', () => {
    const map: AuthorTagMap = { alice: { 智者: { url: 't/1', score: 1 } } }
    removeTag(map, 'alice', '智者')
    expect(map.alice).toBeUndefined()
  })

  test('removeTag preserves other tags of the same author', () => {
    const map: AuthorTagMap = {
      alice: {
        智者: { url: 't/1', score: 1 },
        若婴: { url: 't/1', score: -1 },
      },
    }
    removeTag(map, 'alice', '智者')
    expect(map.alice).toEqual({ 若婴: { url: 't/1', score: -1 } })
  })
})

describe('parseAuthorTagMap', () => {
  test('returns empty for null / array / non-object', () => {
    expect(parseAuthorTagMap(null)).toEqual({})
    expect(parseAuthorTagMap([])).toEqual({})
    expect(parseAuthorTagMap('string')).toEqual({})
  })

  test('filters out malformed entries', () => {
    expect(
      parseAuthorTagMap({
        alice: { 智者: { url: 't/1', score: 1 } },
        bob: { 低质: { missing: true } },
        carol: null,
      }),
    ).toEqual({ alice: { 智者: { url: 't/1', score: 1 } } })
  })
})

describe('getAuthorTags', () => {
  test('returns tags for a known author and undefined otherwise', () => {
    const map: AuthorTagMap = { alice: { 智者: { url: 't/1', score: 1 } } }
    expect(getAuthorTags(map, 'alice')).toEqual({ 智者: { url: 't/1', score: 1 } })
    expect(getAuthorTags(map, 'bob')).toBeUndefined()
  })
})

describe('storage keywords', () => {
  test('authorTagsKeyword is the single store key', () => {
    expect(authorTagsKeyword).toBe('author_tags')
  })
})
