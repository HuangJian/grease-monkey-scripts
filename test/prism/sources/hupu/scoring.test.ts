import { describe, expect, test } from 'bun:test'
import {
  computeBaseScore,
  computeHupuDecayedScore,
  mergeBoardPosts,
  selectPostsPerBoard,
} from '../../../../src/prism/hupu/scoring'
import type { HupuCountOptions, HupuPost } from '../../../../src/prism/hupu/types'

const DEFAULT_COUNT_OPTS: HupuCountOptions = {
  todayMinReplies: 10,
  olderMinReplies: 20,
  ageHalfLifeDays: 2,
  lightsWeight: 1,
  repliesWeight: 1,
}

const NOW = Date.now()

function post(over: Partial<HupuPost>): HupuPost {
  return {
    id: 'x',
    title: 't',
    url: 'https://bbs.hupu.com/x',
    lights: 0,
    replies: 0,
    views: 0,
    author: 'a',
    authorUrl: '',
    board: 'vote-hot',
    topicName: '',
    created: NOW,
    ...over,
  }
}

function toMap(items: HupuPost[]): Map<string, HupuPost> {
  return new Map(items.map((p) => [p.id, p]))
}

describe('computeBaseScore', () => {
  test('returns 0 for zero lights and replies', () => {
    expect(computeBaseScore(post({ lights: 0, replies: 0 }), 1, 1)).toBe(0)
  })
  test('log1p compresses large values', () => {
    const score50 = computeBaseScore(post({ lights: 50, replies: 0 }), 1, 0)
    const score2600 = computeBaseScore(post({ lights: 0, replies: 2600 }), 0, 1)
    expect(score50).toBeCloseTo(Math.log1p(50))
    expect(score2600).toBeCloseTo(Math.log1p(2600))
    expect(score2600 / score50).toBeLessThan(52)
  })
  test('weights are applied', () => {
    const score1 = computeBaseScore(post({ lights: 10, replies: 10 }), 1, 1)
    const score2 = computeBaseScore(post({ lights: 10, replies: 10 }), 2, 3)
    expect(score2).toBeCloseTo(score1 * 2.5)
  })
})

describe('computeHupuDecayedScore', () => {
  test('returns 0 for zero base score', () => {
    expect(computeHupuDecayedScore(post({ lights: 0, replies: 0 }), NOW, DEFAULT_COUNT_OPTS)).toBe(
      0,
    )
  })
  test('returns full base score when post is from now', () => {
    const p = post({ lights: 50, replies: 300, created: NOW })
    const score = computeHupuDecayedScore(p, NOW, DEFAULT_COUNT_OPTS)
    const expected = Math.log1p(50) + Math.log1p(300)
    expect(score).toBeCloseTo(expected)
  })
  test('halves after one halfLife', () => {
    const halfLifeDays = 2
    const halfLifeMs = halfLifeDays * 86_400_000
    const p = post({ lights: 50, replies: 300, created: NOW - halfLifeMs })
    const score = computeHupuDecayedScore(p, NOW, {
      ...DEFAULT_COUNT_OPTS,
      ageHalfLifeDays: halfLifeDays,
    })
    const base = Math.log1p(50) + Math.log1p(300)
    expect(score).toBeCloseTo(base * 0.5, 5)
  })
  test('treats future created as today (no negative decay)', () => {
    const p = post({ lights: 50, replies: 300, created: NOW + 86_400_000 })
    const score = computeHupuDecayedScore(p, NOW, DEFAULT_COUNT_OPTS)
    const base = Math.log1p(50) + Math.log1p(300)
    expect(score).toBeCloseTo(base)
  })
  test('shorter halfLife decays faster', () => {
    const twoDaysAgo = post({ lights: 50, replies: 300, created: NOW - 2 * 86_400_000 })
    const slower = computeHupuDecayedScore(twoDaysAgo, NOW, {
      ...DEFAULT_COUNT_OPTS,
      ageHalfLifeDays: 4,
    })
    const faster = computeHupuDecayedScore(twoDaysAgo, NOW, {
      ...DEFAULT_COUNT_OPTS,
      ageHalfLifeDays: 1,
    })
    expect(slower).toBeGreaterThan(faster)
  })
  test('lights contribution is preserved (A > D in plan example)', () => {
    const a = post({ lights: 50, replies: 315, created: NOW })
    const d = post({ lights: 0, replies: 2600, created: NOW })
    const scoreA = computeHupuDecayedScore(a, NOW, DEFAULT_COUNT_OPTS)
    const scoreD = computeHupuDecayedScore(d, NOW, DEFAULT_COUNT_OPTS)
    expect(scoreA).toBeGreaterThan(scoreD)
  })
})

describe('mergeBoardPosts', () => {
  test('passes through live posts untouched when history is empty', () => {
    const live = [{ board: 'vote-hot', posts: [post({ id: '1', lights: 50 })] }]
    const result = mergeBoardPosts(live, new Map())
    expect(result[0]!.board).toBe('vote-hot')
    expect(result[0]!.posts[0]!.id).toBe('1')
    expect(result[0]!.posts[0]!.lights).toBe(50)
  })
  test('merges prev post with live: takes max lights/replies, min created', () => {
    const live = [
      {
        board: 'vote-hot',
        posts: [post({ id: '1', lights: 50, replies: 100, created: NOW })],
      },
    ]
    const prevPosts = [
      post({ id: '1', lights: 80, replies: 50, board: 'vote-hot', created: NOW - 86_400_000 }),
    ]
    const result = mergeBoardPosts(live, toMap(prevPosts))
    const merged = result[0]!.posts[0]!
    expect(merged.lights).toBe(80)
    expect(merged.replies).toBe(100)
    expect(merged.created).toBe(NOW - 86_400_000)
  })
  test('prev-only post appears only in its board', () => {
    const live: Array<{ board: string; posts: HupuPost[] }> = [
      { board: 'vote-hot', posts: [post({ id: 'a1', lights: 50, board: 'vote-hot' })] },
      { board: 'bxj', posts: [post({ id: 'b1', lights: 30, board: 'bxj' })] },
    ]
    const prevPosts = [post({ id: 'h1', lights: 200, board: 'vote-hot', created: NOW - 1000 })]
    const result = mergeBoardPosts(live, toMap(prevPosts))
    const boards = result.map((r) => r.board).sort()
    expect(boards).toEqual(['bxj', 'vote-hot'])
    const allIds = result.flatMap((r) => r.posts.map((p) => p.id))
    expect(allIds.filter((id) => id === 'h1')).toHaveLength(1)
  })
  test('prev post with board not in live config is dropped', () => {
    const live: Array<{ board: string; posts: HupuPost[] }> = []
    const prevPosts = [post({ id: 'h1', board: 'orphan', created: NOW - 1000 })]
    const result = mergeBoardPosts(live, toMap(prevPosts))
    expect(result).toEqual([])
  })
})

describe('selectPostsPerBoard', () => {
  test('returns empty map for empty input', () => {
    const result = selectPostsPerBoard([], { ...DEFAULT_COUNT_OPTS, now: NOW })
    expect(result.size).toBe(0)
  })
  test('filters old posts by olderMinReplies threshold', () => {
    const twoDaysAgo = NOW - 2 * 86_400_000
    const posts = [
      post({ id: 'low', replies: 5, created: twoDaysAgo }),
      post({ id: 'high', replies: 30, created: twoDaysAgo }),
    ]
    const result = selectPostsPerBoard([{ board: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      olderMinReplies: 10,
      now: NOW,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['high'])
  })
  test('filters today posts by todayMinReplies threshold', () => {
    const posts = [
      post({ id: 'today-low', replies: 0, created: NOW }),
      post({ id: 'today-high', replies: 50, created: NOW }),
    ]
    const result = selectPostsPerBoard([{ board: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      todayMinReplies: 10,
      now: NOW,
    })
    expect(result.get('x')!.map((p) => p.id)).toEqual(['today-high'])
  })
  test('sorts by decayed score', () => {
    const twoDaysAgo = NOW - 2 * 86_400_000
    const posts = [
      post({ id: 'new-low', lights: 20, replies: 30, created: NOW }),
      post({ id: 'old-high', lights: 50, replies: 300, created: twoDaysAgo }),
    ]
    const result = selectPostsPerBoard([{ board: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      now: NOW,
    })
    const ids = result.get('x')!.map((p) => p.id)
    expect(ids).toContain('old-high')
    expect(ids).toContain('new-low')
    const scores = ids.map((id) => {
      const p = posts.find((pp) => pp.id === id)!
      return computeHupuDecayedScore(p, NOW, DEFAULT_COUNT_OPTS)
    })
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1])
  })
  test('no truncation: returns all posts after filtering', () => {
    const posts = Array.from({ length: 50 }, (_, i) =>
      post({ id: `p${i}`, lights: 50 - i, replies: 100 - i }),
    )
    const result = selectPostsPerBoard([{ board: 'x', posts }], {
      ...DEFAULT_COUNT_OPTS,
      now: NOW,
    })
    expect(result.get('x')).toHaveLength(50)
  })
})
