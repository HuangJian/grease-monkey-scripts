import { describe, expect, test } from 'bun:test'
import { dynamicRedditCount, mergeRedditPosts } from '../../../../src/dashboard/reddit/scoring'
import type { RedditCountOptions, RedditPost } from '../../../../src/dashboard/reddit/types'

const DEFAULT_COUNT_OPTS: RedditCountOptions = {
  minItems: 10,
  maxItems: 30,
  minPerSub: 1,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffScore: 500,
}

const LOW_FLOOR_OPTS: RedditCountOptions = {
  ...DEFAULT_COUNT_OPTS,
  minCutoffScore: 0,
}

describe('dynamicRedditCount', () => {
  test('returns 0 for empty input', () => {
    expect(dynamicRedditCount([], DEFAULT_COUNT_OPTS)).toBe(0)
  })
  test('returns minItems when leader is 0 or invalid', () => {
    expect(dynamicRedditCount([0, 0, 0], DEFAULT_COUNT_OPTS)).toBe(DEFAULT_COUNT_OPTS.minItems)
    expect(dynamicRedditCount([NaN, 1], DEFAULT_COUNT_OPTS)).toBe(DEFAULT_COUNT_OPTS.minItems)
  })
  test('cuts at elbow when there is a sharp drop', () => {
    const replies = [20000, 18000, 15000, 12000, 3000, 2000, 1000]
    const result = dynamicRedditCount(replies, DEFAULT_COUNT_OPTS)
    expect(result).toBeGreaterThanOrEqual(DEFAULT_COUNT_OPTS.minItems)
    expect(result).toBeLessThanOrEqual(DEFAULT_COUNT_OPTS.maxItems)
  })
  test('clamps to max when heat is broadly distributed', () => {
    const replies = Array.from({ length: 50 }, (_, i) => 1000 - i * 5)
    const result = dynamicRedditCount(replies, DEFAULT_COUNT_OPTS)
    expect(result).toBeLessThanOrEqual(DEFAULT_COUNT_OPTS.maxItems)
  })
  test('clamps to min when distribution is flat', () => {
    const replies = [5, 5, 5, 5, 5, 5, 5, 5]
    expect(dynamicRedditCount(replies, DEFAULT_COUNT_OPTS)).toBe(DEFAULT_COUNT_OPTS.minItems)
  })
  test('honors custom min/max', () => {
    const replies = [100, 80, 50, 30, 20, 10, 5, 3]
    const opts = { ...DEFAULT_COUNT_OPTS, minItems: 3, maxItems: 5 }
    const result = dynamicRedditCount(replies, opts)
    expect(result).toBeGreaterThanOrEqual(3)
    expect(result).toBeLessThanOrEqual(5)
  })
  test('minCutoffScore raises the floor', () => {
    const replies = [50, 20, 10, 8, 5, 5, 5]
    const opts = { ...DEFAULT_COUNT_OPTS, minCutoffScore: 20 }
    const result = dynamicRedditCount(replies, opts)
    expect(result).toBeLessThanOrEqual(opts.maxItems)
  })
})

describe('mergeRedditPosts', () => {
  function post(over: Partial<RedditPost>): RedditPost {
    return {
      id: 'x',
      title: 't',
      url: 'https://www.reddit.com/r/x/comments/x/t',
      score: 0,
      numComments: 0,
      subreddits: ['x'],
      author: 'a',
      ...over,
    }
  }

  test('merges two subs and dedupes by id', () => {
    const perSub = [
      { sub: 'aww', posts: [post({ id: '1', score: 100, title: 'A' })] },
      { sub: 'funny', posts: [post({ id: '1', score: 80, title: 'F' })] },
    ]
    const result = mergeRedditPosts(perSub, { ...LOW_FLOOR_OPTS, maxItems: 30 })
    expect(result).toHaveLength(1)
    expect(result[0]!.subreddits).toEqual(['aww', 'funny'])
  })
  test('keeps first-listed sub order when merging', () => {
    const perSub = [
      { sub: 'funny', posts: [post({ id: '1', score: 100 })] },
      { sub: 'aww', posts: [post({ id: '1', score: 100 })] },
    ]
    const result = mergeRedditPosts(perSub, { ...LOW_FLOOR_OPTS, maxItems: 30 })
    expect(result[0]!.subreddits).toEqual(['funny', 'aww'])
  })
  test('sorts by score desc', () => {
    const perSub = [
      {
        sub: 'a',
        posts: [post({ id: '1', score: 10 }), post({ id: '2', score: 100 })],
      },
    ]
    const result = mergeRedditPosts(perSub, { ...LOW_FLOOR_OPTS, maxItems: 30 })
    expect(result.map((p) => p.id)).toEqual(['2', '1'])
  })
  test('tiebreaks by numComments desc', () => {
    const perSub = [
      {
        sub: 'a',
        posts: [
          post({ id: '1', score: 50, numComments: 5 }),
          post({ id: '2', score: 50, numComments: 20 }),
        ],
      },
    ]
    const result = mergeRedditPosts(perSub, { ...LOW_FLOOR_OPTS, maxItems: 30 })
    expect(result.map((p) => p.id)).toEqual(['2', '1'])
  })
  test('applies minCutoffScore as a hard floor', () => {
    const perSub = [
      {
        sub: 'a',
        posts: [post({ id: '1', score: 50 }), post({ id: '2', score: 8000 })],
      },
    ]
    const result = mergeRedditPosts(perSub, {
      ...DEFAULT_COUNT_OPTS,
      minCutoffScore: 1000,
      maxItems: 30,
    })
    expect(result.map((p) => p.id)).toEqual(['2'])
  })
  test('respects maxItems cap', () => {
    const perSub = [
      {
        sub: 'a',
        posts: Array.from({ length: 50 }, (_, i) => post({ id: String(i), score: 100 - i })),
      },
    ]
    const result = mergeRedditPosts(perSub, { ...LOW_FLOOR_OPTS, maxItems: 5 })
    expect(result).toHaveLength(5)
  })
  test('handles empty perSub array', () => {
    expect(mergeRedditPosts([], { ...LOW_FLOOR_OPTS, maxItems: 30 })).toEqual([])
  })
  test('quota ensures each sub gets representation even with score disparity', () => {
    const bigPosts = Array.from({ length: 20 }, (_, i) =>
      post({ id: `big${i}`, score: 50000 - i * 1000 }),
    )
    const smallPosts = Array.from({ length: 10 }, (_, i) =>
      post({ id: `small${i}`, score: 3000 - i * 100 }),
    )
    const result = mergeRedditPosts(
      [
        { sub: 'funny', posts: bigPosts },
        { sub: 'programming', posts: smallPosts },
      ],
      { ...LOW_FLOOR_OPTS, maxItems: 10, minPerSub: 0 },
    )
    const smallCount = result.filter((p) => p.id.startsWith('small')).length
    expect(smallCount).toBeGreaterThanOrEqual(5)
  })
  test('minPerSub forces minimum representation per sub', () => {
    const bigPosts = Array.from({ length: 20 }, (_, i) =>
      post({ id: `big${i}`, score: 50000 - i * 1000 }),
    )
    const smallPosts = [post({ id: 'solo', score: 100 })]
    const result = mergeRedditPosts(
      [
        { sub: 'funny', posts: bigPosts },
        { sub: 'niche', posts: smallPosts },
      ],
      { ...LOW_FLOOR_OPTS, maxItems: 20, minPerSub: 3 },
    )
    expect(result.find((p) => p.id === 'solo')).toBeDefined()
  })
  test('remainder slots go to highest-scoring leftover posts', () => {
    const postsA = [post({ id: 'a1', score: 100 }), post({ id: 'a2', score: 90 })]
    const postsB = [post({ id: 'b1', score: 95 })]
    const result = mergeRedditPosts(
      [
        { sub: 'a', posts: postsA },
        { sub: 'b', posts: postsB },
      ],
      { ...LOW_FLOOR_OPTS, maxItems: 3, minPerSub: 0 },
    )
    expect(result.map((p) => p.id)).toEqual(['a1', 'b1', 'a2'])
  })
})
