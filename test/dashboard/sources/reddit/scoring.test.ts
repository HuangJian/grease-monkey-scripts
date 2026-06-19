import { describe, expect, test } from 'bun:test'
import {
  computeRedditDecayedScore,
  mergeSubPosts,
  selectPostsPerSub,
} from '../../../../src/dashboard/reddit/scoring'
import type { RedditCountOptions, RedditPost } from '../../../../src/dashboard/reddit/types'

const DEFAULT_COUNT_OPTS: RedditCountOptions = {
  todayMinComments: 10,
  olderMinComments: 20,
  ageHalfLifeDays: 2,
}

const NOW = Date.now()

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

function toMap(items: RedditPost[]): Map<string, RedditPost> {
  return new Map(items.map((p) => [p.id, p]))
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
    const result = mergeSubPosts(live, new Map())
    expect(result[0]!.sub).toBe('aww')
    expect(result[0]!.posts[0]!.id).toBe('1')
    expect(result[0]!.posts[0]!.score).toBe(100)
  })
  test('merges prev post with live: takes max score, union subreddits, min created', () => {
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
    const prevPosts = [
      post({
        id: '1',
        score: 150,
        numComments: 8,
        author: 'bob',
        subreddits: ['aww', 'funny'],
        created: NOW - 86_400_000,
      }),
    ]
    const result = mergeSubPosts(live, toMap(prevPosts))
    const merged = result[0]!.posts[0]!
    expect(merged.score).toBe(150)
    expect(merged.numComments).toBe(8)
    expect(merged.subreddits).toEqual(['aww', 'funny'])
    expect(merged.created).toBe(NOW - 86_400_000)
    expect(merged.author).toBe('alice')
  })
  test('prev-only post appears only in matching sub', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      { sub: 'aww', posts: [post({ id: 'a1', score: 100, subreddits: ['aww'] })] },
      { sub: 'funny', posts: [post({ id: 'f1', score: 100, subreddits: ['funny'] })] },
    ]
    const prevPosts = [
      post({ id: 'h1', score: 200, subreddits: ['aww', 'funny'], created: NOW - 1000 }),
    ]
    const result = mergeSubPosts(live, toMap(prevPosts))
    const subs = result.map((r) => r.sub).sort()
    expect(subs).toEqual(['aww', 'funny'])
    const allIds = result.flatMap((r) => r.posts.map((p) => p.id))
    const count = allIds.filter((id) => id === 'h1').length
    expect(count).toBeGreaterThanOrEqual(1)
  })
  test('prev post with subs not in live config is dropped', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = []
    const prevPosts = [post({ id: 'h1', subreddits: ['orphan'], created: NOW - 1000 })]
    const result = mergeSubPosts(live, toMap(prevPosts))
    expect(result).toEqual([])
  })
  test('live post with empty list and no prev returns empty result for that sub', () => {
    const live = [{ sub: 'aww', posts: [] as RedditPost[] }]
    const result = mergeSubPosts(live, new Map())
    expect(result).toEqual([])
  })
})

describe('selectPostsPerSub', () => {
  test('returns empty map for empty input', () => {
    const result = selectPostsPerSub([], { ...DEFAULT_COUNT_OPTS, now: NOW })
    expect(result.size).toBe(0)
  })
  test('filters old posts by olderMinComments threshold', () => {
    const twoDaysAgo = NOW - 2 * 86_400_000
    const posts = [
      post({ id: 'low', numComments: 5, created: twoDaysAgo }),
      post({ id: 'high', numComments: 30, created: twoDaysAgo }),
    ]
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      olderMinComments: 10,
      now: NOW,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['high'])
  })
  test('filters today posts by todayMinComments threshold', () => {
    const posts = [
      post({ id: 'today-low', numComments: 0, created: NOW }),
      post({ id: 'today-high', numComments: 50, created: NOW }),
    ]
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      todayMinComments: 10,
      now: NOW,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['today-high'])
  })
  test('sorts by decayed score (older high-score post can beat newer low-score)', () => {
    const twoDaysAgo = NOW - 2 * 86_400_000
    const posts = [
      post({ id: 'new-low', score: 200, numComments: 30, created: NOW }),
      post({ id: 'old-high', score: 1000, numComments: 30, created: twoDaysAgo }),
    ]
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      now: NOW,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['old-high', 'new-low'])
  })
  test('no truncation: returns all posts after filtering', () => {
    const posts = Array.from({ length: 50 }, (_, i) =>
      post({ id: `p${i}`, score: 100 - i, numComments: 10 }),
    )
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      now: NOW,
    })
    expect(result.get('x')).toHaveLength(50)
  })
})
