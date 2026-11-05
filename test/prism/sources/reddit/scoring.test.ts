import { describe, expect, test } from 'bun:test'
import {
  computeRedditDecayedScore,
  mergeSubPosts,
  selectPostsPerSub,
} from '../../../../src/prism/reddit/scoring'
import type { RedditCountOptions, RedditPost } from '../../../../src/prism/reddit/types'

const DEFAULT_COUNT_OPTS: RedditCountOptions = {
  todayMinComments: 10,
  olderMinComments: 20,
  ageHalfLifeDays: 2,
}

const NOW = Date.now()

function post(over: Partial<RedditPost> & { sub?: string }): RedditPost {
  const sub = over.sub ?? 'x'
  const id = over.id ?? 'x'
  return {
    id,
    title: 't',
    url: `https://www.reddit.com/r/${sub}/comments/${id}/t`,
    score: 0,
    numComments: 0,
    author: 'a',
    created: NOW,
    ...over,
  }
}

function toMap(
  items: Array<RedditPost & { sub?: string }>,
): Map<string, { sub: string; post: RedditPost }> {
  return new Map(items.map((p) => [p.id, { sub: p.sub ?? 'x', post: p }]))
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
    const live = [{ sub: 'aww', posts: [post({ id: '1', score: 100, sub: 'aww' })] }]
    const result = mergeSubPosts(live, new Map())
    expect(result[0]!.sub).toBe('aww')
    expect(result[0]!.posts[0]!.id).toBe('1')
    expect(result[0]!.posts[0]!.score).toBe(100)
  })
  test('merges prev post with live: takes max score, min created', () => {
    const live = [
      {
        sub: 'aww',
        posts: [
          post({
            id: '1',
            score: 100,
            numComments: 5,
            author: 'alice',
            sub: 'aww',
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
        sub: 'aww',
        created: NOW - 86_400_000,
      }),
    ]
    const result = mergeSubPosts(live, toMap(prevPosts))
    const merged = result[0]!.posts[0]!
    expect(merged.score).toBe(150)
    expect(merged.numComments).toBe(8)
    expect(merged.created).toBe(NOW - 86_400_000)
    expect(merged.author).toBe('alice')
  })
  test('prev-only post appears only in matching sub', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      { sub: 'aww', posts: [post({ id: 'a1', score: 100, sub: 'aww' })] },
      { sub: 'funny', posts: [post({ id: 'f1', score: 100, sub: 'funny' })] },
    ]
    const prevPosts = [post({ id: 'h1', score: 200, sub: 'aww', created: NOW - 1000 })]
    const result = mergeSubPosts(live, toMap(prevPosts))
    const subs = result.map((r) => r.sub).sort()
    expect(subs).toEqual(['aww', 'funny'])
    const allIds = result.flatMap((r) => r.posts.map((p) => p.id))
    const count = allIds.filter((id) => id === 'h1').length
    expect(count).toBeGreaterThanOrEqual(1)
  })
  test('prev post with subs not in live config is dropped', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = []
    const prevPosts = [post({ id: 'h1', sub: 'orphan', created: NOW - 1000 })]
    const result = mergeSubPosts(live, toMap(prevPosts))
    expect(result).toEqual([])
  })
  test('an empty live group claims the key so its cached posts survive', () => {
    // Feed rotation sends `posts: []` for sections it skipped this round; the
    // group key is the only thing that carries their cached posts over.
    const prev = new Map([['a1', { sub: 'aww', post: post({ id: 'a1', sub: 'aww' }) }]])
    const result = mergeSubPosts([{ sub: 'aww', posts: [] }], prev)
    expect(result.map((r) => r.sub)).toEqual(['aww'])
    expect(result[0]!.posts.map((p) => p.id)).toEqual(['a1'])
  })
  test('an empty live group with nothing cached yields an empty bucket', () => {
    expect(mergeSubPosts([{ sub: 'aww', posts: [] }], new Map())).toEqual([
      { sub: 'aww', posts: [] },
    ])
  })
  test('bugfix: promoted cross-community post from subB does not duplicate into subA', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      {
        sub: 'aww',
        posts: [
          post({ id: 'a1', score: 100, sub: 'aww' }),
          post({ id: 'p1', score: 200, sub: 'funny' }),
        ],
      },
      {
        sub: 'funny',
        posts: [
          post({ id: 'f1', score: 100, sub: 'funny' }),
          post({ id: 'p1', score: 200, sub: 'funny' }),
        ],
      },
    ]
    const result = mergeSubPosts(live, new Map())
    const awwIds = result.find((r) => r.sub === 'aww')!.posts.map((p) => p.id)
    const funnyIds = result.find((r) => r.sub === 'funny')!.posts.map((p) => p.id)
    expect(awwIds).toEqual(['a1'])
    expect(awwIds).not.toContain('p1')
    expect(funnyIds).toContain('f1')
    expect(funnyIds).toContain('p1')
  })
  test('merged group keeps posts from every member', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      {
        sub: 'opencode+opencodecli',
        posts: [
          post({ id: 'a1', score: 100, sub: 'opencode' }),
          post({ id: 'b1', score: 90, sub: 'opencodecli' }),
        ],
      },
    ]
    const result = mergeSubPosts(live, new Map())
    expect(result[0]!.sub).toBe('opencode+opencodecli')
    expect(result[0]!.posts.map((p) => p.id)).toEqual(['a1', 'b1'])
  })
  test('merged group still drops posts from a sub outside the group', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      {
        sub: 'opencode+opencodecli',
        posts: [
          post({ id: 'a1', score: 100, sub: 'opencode' }),
          post({ id: 'x1', score: 200, sub: 'other' }),
        ],
      },
    ]
    const result = mergeSubPosts(live, new Map())
    expect(result[0]!.posts.map((p) => p.id)).toEqual(['a1'])
  })
  test('history keyed by the merged group merges into it', () => {
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      { sub: 'opencode+opencodecli', posts: [post({ id: 'a1', score: 100, sub: 'opencode' })] },
    ]
    const prev = post({
      id: 'a1',
      score: 300,
      numComments: 42,
      sub: 'opencode+opencodecli',
      created: NOW - 1000,
    })
    const result = mergeSubPosts(live, toMap([prev]))
    expect(result[0]!.posts[0]!.score).toBe(300)
    expect(result[0]!.posts[0]!.numComments).toBe(42)
  })
  test('bugfix: prev data with expanded subreddits does not leak to wrong sub', () => {
    const prevPost = post({
      id: 'p1',
      score: 200,
      sub: 'funny',
      created: NOW - 1000,
    })
    const live: Array<{ sub: string; posts: RedditPost[] }> = [
      {
        sub: 'aww',
        posts: [post({ id: 'a1', score: 100, sub: 'aww' })],
      },
      {
        sub: 'funny',
        posts: [
          post({ id: 'f1', score: 100, sub: 'funny' }),
          post({ id: 'p1', score: 150, sub: 'funny' }),
        ],
      },
    ]
    const result = mergeSubPosts(live, toMap([prevPost]))
    const awwIds = result.find((r) => r.sub === 'aww')!.posts.map((p) => p.id)
    const funnyIds = result.find((r) => r.sub === 'funny')!.posts.map((p) => p.id)
    expect(awwIds).toEqual(['a1'])
    expect(awwIds).not.toContain('p1')
    expect(funnyIds).toContain('f1')
    expect(funnyIds).toContain('p1')
  })
})

describe('selectPostsPerSub', () => {
  test('a feed without metrics keeps document order instead of sorting by zero score', () => {
    const posts = [
      post({ id: 'first', metrics: false }),
      post({ id: 'second', metrics: false }),
      post({ id: 'third', metrics: false }),
    ]
    const result = selectPostsPerSub([{ sub: 'x', posts }], { ...DEFAULT_COUNT_OPTS, now: NOW })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['first', 'second', 'third'])
  })

  test('a feed without metrics skips the comment thresholds', () => {
    // A zero placeholder must not be read as "0 comments, drop it".
    const longAgo = NOW - 30 * 86_400_000
    const posts = [post({ id: 'a', metrics: false, created: longAgo })]
    const result = selectPostsPerSub([{ sub: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      olderMinComments: 100,
      now: NOW,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['a'])
  })

  test('one post without metrics switches the whole group to feed order', () => {
    // Upgrade moment: the cache still holds score-ranked entries while the feed
    // brings new metric-less ones. Gating here would drop every new post.
    const posts = [
      post({ id: 'legacy', score: 100, numComments: 50 }),
      post({ id: 'fromFeed', metrics: false }),
    ]
    const result = selectPostsPerSub([{ sub: 'x', posts }], { ...DEFAULT_COUNT_OPTS, now: NOW })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['legacy', 'fromFeed'])
  })

  test('feed order is preserved even when every post has real metrics', () => {
    // Archive numbers are hours stale: ranking/gating with them would bury a
    // fresh post that only has 1 comment in the snapshot.
    const posts = [
      post({ id: 'first', score: 10, numComments: 1 }),
      post({ id: 'second', score: 9999, numComments: 500 }),
    ]
    const result = selectPostsPerSub(
      [{ sub: 'x', posts }],
      { ...DEFAULT_COUNT_OPTS, olderMinComments: 100, now: NOW },
      true,
    )
    expect(result.get('x')!.map((p) => p.id)).toEqual(['first', 'second'])
  })

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
  test('ranks a merged group as one pool across both subs', () => {
    const posts = [
      post({ id: 'from-a', score: 10, numComments: 30, sub: 'opencode' }),
      post({ id: 'from-b', score: 500, numComments: 30, sub: 'opencodecli' }),
    ]
    const result = selectPostsPerSub([{ sub: 'opencode+opencodecli', posts }], {
      ...DEFAULT_COUNT_OPTS,
      now: NOW,
    })
    expect(result.get('opencode+opencodecli')!.map((p) => p.id)).toEqual(['from-b', 'from-a'])
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
