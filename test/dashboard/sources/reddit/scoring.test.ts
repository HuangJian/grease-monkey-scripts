import { describe, expect, test } from 'bun:test'
import {
  computeRedditDecayedScore,
  mergeSubPosts,
  selectPostsPerSub,
} from '../../../../src/dashboard/reddit/scoring'
import type {
  RedditCountOptions,
  RedditPost,
  StoredHistoryPost,
} from '../../../../src/dashboard/reddit/types'

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

const NOW = 1_700_000_000_000

function post(over: Partial<RedditPost>): RedditPost {
  return {
    id: 'x',
    title: 't',
    url: 'https://www.reddit.com/r/x/comments/x/t',
    score: 0,
    numComments: 0,
    subreddits: ['x'],
    author: 'a',
    created: NOW,
    ...over,
  }
}

function stored(over: Partial<StoredHistoryPost>): StoredHistoryPost {
  return {
    id: 'x',
    title: 't',
    url: 'https://www.reddit.com/r/x/comments/x/t',
    score: 0,
    numComments: 0,
    subreddits: ['x'],
    author: 'a',
    created: NOW,
    ...over,
  }
}

describe('computeRedditDecayedScore', () => {
  test('returns 0 for non-positive score', () => {
    expect(computeRedditDecayedScore(post({ score: 0 }), NOW, 2)).toBe(0)
    expect(computeRedditDecayedScore(post({ score: -5 }), NOW, 2)).toBe(0)
  })
  test('returns full score when post is from now', () => {
    expect(computeRedditDecayedScore(post({ score: 100, created: NOW }), NOW, 2)).toBeCloseTo(100)
  })
  test('halves after one halfLife', () => {
    const halfLifeDays = 2
    const halfLifeMs = halfLifeDays * 86_400_000
    expect(
      computeRedditDecayedScore(
        post({ score: 1000, created: NOW - halfLifeMs }),
        NOW,
        halfLifeDays,
      ),
    ).toBeCloseTo(500, 5)
  })
  test('treats future created as today (no negative decay)', () => {
    expect(
      computeRedditDecayedScore(post({ score: 100, created: NOW + 86_400_000 }), NOW, 2),
    ).toBeCloseTo(100)
  })
  test('shorter halfLife decays faster', () => {
    const twoDaysAgo = post({ score: 1000, created: NOW - 2 * 86_400_000 })
    const slower = computeRedditDecayedScore(twoDaysAgo, NOW, 4)
    const faster = computeRedditDecayedScore(twoDaysAgo, NOW, 1)
    expect(slower).toBeGreaterThan(faster)
  })
})

describe('mergeSubPosts', () => {
  test('passes through live posts untouched when history is empty', () => {
    const live = [{ sub: 'aww', posts: [post({ id: '1', score: 100 })] }]
    const result = mergeSubPosts(live, [])
    expect(result[0]!.sub).toBe('aww')
    expect(result[0]!.posts[0]!.id).toBe('1')
    expect(result[0]!.posts[0]!.score).toBe(100)
  })
  test('merges history post with live: takes max score, union subreddits, min created', () => {
    const live = [
      {
        sub: 'aww',
        posts: [
          post({
            id: '1',
            score: 100,
            numComments: 5,
            author: 'alice',
            subreddits: ['aww'],
            created: NOW,
          }),
        ],
      },
    ]
    const hist = [
      stored({
        id: '1',
        score: 150,
        numComments: 8,
        author: 'bob',
        subreddits: ['aww', 'funny'],
        created: NOW - 86_400_000,
        title: 'old title',
        url: 'https://www.reddit.com/old',
      }),
    ]
    const result = mergeSubPosts(live, hist)
    const merged = result[0]!.posts[0]!
    expect(merged.score).toBe(150)
    expect(merged.numComments).toBe(8)
    expect(merged.subreddits).toEqual(['aww', 'funny'])
    expect(merged.created).toBe(NOW - 86_400_000)
    expect(merged.author).toBe('alice')
  })
  test('history-only post appears in first matching sub only (no cross-sub duplication)', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      { sub: 'aww', posts: [post({ id: 'a1', score: 100, subreddits: ['aww'] })] },
      { sub: 'funny', posts: [post({ id: 'f1', score: 100, subreddits: ['funny'] })] },
    ]
    const hist = [
      stored({
        id: 'h1',
        score: 200,
        subreddits: ['aww', 'funny'],
        created: NOW - 1000,
      }),
    ]
    const result = mergeSubPosts(live, hist)
    const subs = result.map((r) => r.sub).sort()
    expect(subs).toEqual(['aww', 'funny'])
    const allIds = result.flatMap((r) => r.posts.map((p) => p.id))
    expect(allIds.filter((id) => id === 'h1')).toHaveLength(1)
  })
  test('history post with subs not in live config is dropped', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = []
    const hist = [stored({ id: 'h1', subreddits: ['orphan'], created: NOW - 1000 })]
    const result = mergeSubPosts(live, hist)
    expect(result).toEqual([])
  })
  test('live post with empty list and no history returns empty result for that sub', () => {
    const live = [{ sub: 'aww', posts: [] as RedditPost[] }]
    const result = mergeSubPosts(live, [])
    expect(result).toEqual([])
  })
})

describe('selectPostsPerSub', () => {
  test('returns empty map for empty input', () => {
    const result = selectPostsPerSub([], { ...LOW_FLOOR_OPTS, ageHalfLifeDays: 2, now: NOW })
    expect(result.size).toBe(0)
  })
  test('caps each sub at maxItems', () => {
    const posts = Array.from({ length: 50 }, (_, i) => post({ id: `a${i}`, score: 1000 - i }))
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...LOW_FLOOR_OPTS,
      maxItems: 5,
      ageHalfLifeDays: 2,
      now: NOW,
    })
    expect(result.get('x')).toHaveLength(5)
  })
  test('minPerSub forces at least N posts per sub (when data available)', () => {
    const big = Array.from({ length: 20 }, (_, i) => post({ id: `big${i}`, score: 5000 - i }))
    const small = Array.from({ length: 5 }, (_, i) => post({ id: `small${i}`, score: 100 - i }))
    const result = selectPostsPerSub(
      [
        { sub: 'funny', posts: big },
        { sub: 'niche', posts: small },
      ],
      { ...LOW_FLOOR_OPTS, maxItems: 20, minPerSub: 3, ageHalfLifeDays: 2, now: NOW },
    )
    expect(result.get('niche')).toHaveLength(5)
    expect(result.get('funny')).toHaveLength(20)
  })

  test('isolates per-sub cap: each sub capped at maxItems independently', () => {
    const big = Array.from({ length: 20 }, (_, i) => post({ id: `big${i}`, score: 5000 - i }))
    const small = Array.from({ length: 20 }, (_, i) => post({ id: `small${i}`, score: 1000 - i }))
    const result = selectPostsPerSub(
      [
        { sub: 'funny', posts: big },
        { sub: 'niche', posts: small },
      ],
      { ...LOW_FLOOR_OPTS, maxItems: 10, minPerSub: 0, ageHalfLifeDays: 2, now: NOW },
    )
    expect(result.get('funny')).toHaveLength(10)
    expect(result.get('niche')).toHaveLength(10)
  })
  test('when sub has fewer posts than minPerSub, returns all available', () => {
    const result = selectPostsPerSub([{ sub: 'x', posts: [post({ id: '1', score: 100 })] }], {
      ...LOW_FLOOR_OPTS,
      minPerSub: 5,
      ageHalfLifeDays: 2,
      now: NOW,
    })
    expect(result.get('x')).toHaveLength(1)
  })
  test('applies minCutoffScore as a hard floor', () => {
    const posts = [post({ id: '1', score: 50 }), post({ id: '2', score: 8000 })]
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      minCutoffScore: 1000,
      ageHalfLifeDays: 2,
      now: NOW,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['2'])
  })
  test('sorts by decayed score (older high-score post can beat newer low-score)', () => {
    const twoDaysAgo = NOW - 2 * 86_400_000
    const posts = [
      post({ id: 'new-low', score: 200, created: NOW }),
      post({ id: 'old-high', score: 1000, created: twoDaysAgo }),
    ]
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...LOW_FLOOR_OPTS,
      ageHalfLifeDays: 2,
      now: NOW,
      maxItems: 5,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['old-high', 'new-low'])
  })
  test('isolates per-sub cap so big sub cannot consume small sub slots', () => {
    const big = Array.from({ length: 20 }, (_, i) => post({ id: `big${i}`, score: 5000 - i }))
    const small = Array.from({ length: 10 }, (_, i) =>
      post({ id: `small${i}`, score: 1000 - i * 10 }),
    )
    const result = selectPostsPerSub(
      [
        { sub: 'funny', posts: big },
        { sub: 'niche', posts: small },
      ],
      { ...LOW_FLOOR_OPTS, maxItems: 5, minPerSub: 0, ageHalfLifeDays: 2, now: NOW },
    )
    const funnyCount = result.get('funny')!.length
    const nicheCount = result.get('niche')!.length
    expect(funnyCount).toBeLessThanOrEqual(5)
    expect(nicheCount).toBeGreaterThan(0)
    expect(funnyCount + nicheCount).toBeLessThanOrEqual(10)
  })
})
