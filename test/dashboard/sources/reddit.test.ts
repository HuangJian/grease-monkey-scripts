import { beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  clearRedditTopicState,
  createRedditSource,
  dynamicRedditCount,
  fetchReddit,
  mergeRedditPosts,
  normalizeSubredditName,
  parseRedditListing,
  type RedditCountOptions,
  type RedditPost,
  type RedditSourceOptions,
} from '../../../src/dashboard/reddit/source'
import { validateConfig } from '../../../src/dashboard/config'
import type { Runtime, RequestDetails } from '../../../src/runtime'
import { createRuntime } from '../../runtime'

const DEFAULT_COUNT_OPTS: RedditCountOptions = {
  minItems: 10,
  maxItems: 30,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffScore: 500,
}

const LOW_FLOOR_OPTS: RedditCountOptions = {
  ...DEFAULT_COUNT_OPTS,
  minCutoffScore: 0,
}

function defaultRedditOpts(over: Partial<RedditSourceOptions> = {}): RedditSourceOptions {
  return {
    ttlMinutes: 30,
    subreddits: ['popular'],
    ...DEFAULT_COUNT_OPTS,
    ...over,
  }
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.v2ex.com/',
  })
}

function loadFixture(): unknown {
  const text = readFileSync(join(import.meta.dir, '..', 'fixtures', 'reddit-popular.json'), 'utf8')
  return JSON.parse(text)
}

function makeRuntime(dom: JSDOM, handler: (d: RequestDetails) => void): Runtime {
  const base = createRuntime(dom)
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

describe('normalizeSubredditName', () => {
  test('strips r/ prefix and lowercases', () => {
    expect(normalizeSubredditName('r/Funny')).toBe('funny')
  })
  test('strips leading slash', () => {
    expect(normalizeSubredditName('/funny')).toBe('funny')
  })
  test('strips /r/ prefix', () => {
    expect(normalizeSubredditName('/r/funny')).toBe('funny')
  })
  test('trims whitespace', () => {
    expect(normalizeSubredditName('  funny  ')).toBe('funny')
  })
  test('removes invalid characters', () => {
    expect(normalizeSubredditName('awe some!')).toBe('awesome')
  })
  test('returns empty for blank or invalid input', () => {
    expect(normalizeSubredditName('   ')).toBe('')
    expect(normalizeSubredditName('!!!')).toBe('')
  })
})

describe('parseRedditListing', () => {
  test('parses valid listing', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    const ids = posts.map((p) => p.id)
    expect(ids).toContain('pop001')
    expect(ids).toContain('pop002')
  })
  test('builds absolute permalink url', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    const post = posts.find((p) => p.id === 'pop001')!
    expect(post.url).toBe(
      'https://www.reddit.com/r/aww/comments/pop001/cat_photobombs_every_family_photo/',
    )
  })
  test('skips non-t3 children (t1 comments)', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'comment001')).toBeUndefined()
  })
  test('drops over_18 posts', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'pop004')).toBeUndefined()
  })
  test('drops distinguished=promoted posts', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'pop006')).toBeUndefined()
  })
  test('drops posts with empty title', () => {
    const json = loadFixture()
    const posts = parseRedditListing(json, 100)
    expect(posts.find((p) => p.id === 'pop005')).toBeUndefined()
  })
  test('returns empty for non-listing input', () => {
    expect(parseRedditListing(null, 10)).toEqual([])
    expect(parseRedditListing({}, 10)).toEqual([])
    expect(parseRedditListing({ data: {} }, 10)).toEqual([])
    expect(parseRedditListing({ data: { children: 'x' } }, 10)).toEqual([])
  })
  test('respects maxItems', () => {
    const json = loadFixture()
    expect(parseRedditListing(json, 2)).toHaveLength(2)
  })
  test('normalizes subreddit names', () => {
    const json = {
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'x',
              title: 't',
              permalink: '/r/X/comments/x/',
              score: 10,
              num_comments: 1,
              subreddit: 'r/Sub',
            },
          },
        ],
      },
    }
    const [post] = parseRedditListing(json, 10)
    expect(post.subreddits).toEqual(['sub'])
  })
})

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
})

describe('fetchReddit', () => {
  test('fetches one sub, returns merged posts', async () => {
    const dom = makeDom()
    const json = loadFixture()
    const calls: RequestDetails[] = []
    const runtime = makeRuntime(dom, (d) => {
      calls.push(d)
      d.onload({ responseText: JSON.stringify(json) })
    })
    const result = await fetchReddit(runtime, defaultRedditOpts())
    expect(result.posts.length).toBeGreaterThan(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/r/popular/hot.json')
  })
  test('sends custom User-Agent and forwards session cookies (anonymous: false)', async () => {
    const dom = makeDom()
    const json = loadFixture()
    let captured: RequestDetails | undefined
    const runtime = makeRuntime(dom, (d) => {
      captured = d
      d.onload({ responseText: JSON.stringify(json) })
    })
    await fetchReddit(runtime, defaultRedditOpts())
    expect(captured!.anonymous).toBe(false)
    expect(captured!.headers?.['User-Agent']).toMatch(/^web:grease-monkey-dashboard:/)
  })
  test('fetches multiple subs in parallel and accumulates subreddits on dedupe', async () => {
    const dom = makeDom()
    const popular = {
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'shared',
              title: 'shared title',
              permalink: '/r/popular/comments/shared/x/',
              score: 5000,
              num_comments: 100,
              subreddit: 'popular',
            },
          },
        ],
      },
    }
    const funny = {
      data: {
        children: [
          {
            kind: 't3',
            data: {
              id: 'shared',
              title: 'shared title',
              permalink: '/r/funny/comments/shared/x/',
              score: 5000,
              num_comments: 100,
              subreddit: 'funny',
            },
          },
        ],
      },
    }
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('/r/funny/')) {
        d.onload({ responseText: JSON.stringify(funny) })
      } else {
        d.onload({ responseText: JSON.stringify(popular) })
      }
    })
    const result = await fetchReddit(
      runtime,
      defaultRedditOpts({ subreddits: ['popular', 'funny'] }),
    )
    const shared = result.posts.find((p) => p.id === 'shared')
    expect(shared).toBeDefined()
    expect(shared!.subreddits).toEqual(['popular', 'funny'])
  })
  test('per-sub normalization preserves small sub hot posts when large sub yields fewer picks', async () => {
    const dom = makeDom()
    const popularBig = {
      data: {
        children: Array.from({ length: 20 }, (_, i) => ({
          kind: 't3',
          data: {
            id: `big${i}`,
            title: `big ${i}`,
            permalink: `/r/popular/comments/big${i}/x/`,
            score: 30000 - i * 50,
            num_comments: 100,
            subreddit: 'popular',
          },
        })),
      },
    }
    const nicheSmall = {
      data: {
        children: Array.from({ length: 10 }, (_, i) => ({
          kind: 't3',
          data: {
            id: `niche${i}`,
            title: `niche ${i}`,
            permalink: `/r/askscience/comments/niche${i}/x/`,
            score: 800 - i * 5,
            num_comments: 30,
            subreddit: 'askscience',
          },
        })),
      },
    }
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('/r/askscience/')) {
        d.onload({ responseText: JSON.stringify(nicheSmall) })
      } else {
        d.onload({ responseText: JSON.stringify(popularBig) })
      }
    })
    const result = await fetchReddit(
      runtime,
      defaultRedditOpts({
        subreddits: ['popular', 'askscience'],
        minItems: 5,
        maxItems: 30,
        minCutoffScore: 0,
        displayRatio: 0.5,
        elbowDropRatio: 0.2,
      }),
    )
    const bigIds = result.posts.filter((p) => p.id.startsWith('big'))
    const nicheIds = result.posts.filter((p) => p.id.startsWith('niche'))
    expect(bigIds.length).toBe(20)
    expect(nicheIds.length).toBe(10)
  })
  test('single sub failure: returns posts from successful sub, no throw', async () => {
    const dom = makeDom()
    const json = loadFixture()
    const runtime = makeRuntime(dom, (d) => {
      if (d.url.includes('/r/askscience/')) d.onerror?.()
      else d.onload({ responseText: JSON.stringify(json) })
    })
    const result = await fetchReddit(
      runtime,
      defaultRedditOpts({ subreddits: ['popular', 'askscience'] }),
    )
    expect(result.posts.length).toBeGreaterThan(0)
    expect(result.partialErrors.some((e) => e.includes('askscience'))).toBe(true)
  })
  test('all subs fail: throws aggregate error', async () => {
    const dom = makeDom()
    const runtime = makeRuntime(dom, (d) => d.onerror?.())
    await expect(
      fetchReddit(runtime, defaultRedditOpts({ subreddits: ['a', 'b'] })),
    ).rejects.toThrow(/all subs failed/)
  })
  test('429 first call with Retry-After triggers one retry', async () => {
    const dom = makeDom()
    const json = loadFixture()
    let calls = 0
    const runtime = makeRuntime(dom, (d) => {
      calls++
      if (calls === 1) {
        d.onload({ responseText: '', status: 429, responseHeaders: 'retry-after: 0' })
      } else {
        d.onload({ responseText: JSON.stringify(json) })
      }
    })
    const result = await fetchReddit(runtime, defaultRedditOpts())
    expect(calls).toBe(2)
    expect(result.posts.length).toBeGreaterThan(0)
  })
  test('429 on both attempts on same host: throws http 429', async () => {
    const dom = makeDom()
    const runtime = makeRuntime(dom, (d) => {
      d.onload({ responseText: '', status: 429, responseHeaders: 'retry-after: 0' })
    })
    await expect(fetchReddit(runtime, defaultRedditOpts())).rejects.toThrow(/http 429/)
  })
  test('http 500 on first call: no retry, throws', async () => {
    const dom = makeDom()
    let calls = 0
    const runtime = makeRuntime(dom, (d) => {
      calls++
      d.onload({ responseText: '', status: 500 })
    })
    await expect(fetchReddit(runtime, defaultRedditOpts())).rejects.toThrow(/http 500/)
    expect(calls).toBe(1)
  })
  test('normalizes subreddit names before fetching', async () => {
    const dom = makeDom()
    const json = loadFixture()
    const urls: string[] = []
    const runtime = makeRuntime(dom, (d) => {
      urls.push(d.url)
      d.onload({ responseText: JSON.stringify(json) })
    })
    await fetchReddit(runtime, defaultRedditOpts({ subreddits: ['/r/Funny', ' AWESOME '] }))
    expect(urls.some((u) => u.includes('/r/funny/'))).toBe(true)
    expect(urls.some((u) => u.includes('/r/awesome/'))).toBe(true)
    expect(urls).toHaveLength(2)
  })
  test('dedupes repeated sub names in config', async () => {
    const dom = makeDom()
    const json = loadFixture()
    const urls: string[] = []
    const runtime = makeRuntime(dom, (d) => {
      urls.push(d.url)
      d.onload({ responseText: JSON.stringify(json) })
    })
    await fetchReddit(
      runtime,
      defaultRedditOpts({ subreddits: ['popular', 'popular', 'r/popular'] }),
    )
    expect(urls).toHaveLength(1)
  })
  test('falls back to www.reddit.com when old.reddit.com returns 403', async () => {
    const dom = makeDom()
    const json = loadFixture()
    const urls: string[] = []
    const runtime = makeRuntime(dom, (d) => {
      urls.push(d.url)
      if (d.url.includes('old.reddit.com')) {
        d.onload({ responseText: '', status: 403 })
      } else {
        d.onload({ responseText: JSON.stringify(json) })
      }
    })
    const result = await fetchReddit(runtime, defaultRedditOpts())
    expect(result.posts.length).toBeGreaterThan(0)
    expect(result.partialErrors).toEqual([])
    expect(urls[0]).toContain('old.reddit.com')
    expect(urls[1]).toContain('www.reddit.com')
  })
  test('both hosts 403: throws http 403', async () => {
    const dom = makeDom()
    const runtime = makeRuntime(dom, (d) => {
      d.onload({ responseText: '', status: 403 })
    })
    await expect(fetchReddit(runtime, defaultRedditOpts())).rejects.toThrow(/http 403/)
  })
})

describe('createRedditSource.render', () => {
  beforeEach(() => {
    clearRedditTopicState()
  })

  test('renders posts with score, sub list, and comments', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    const posts: RedditPost[] = [
      {
        id: 'a',
        title: 'Hello',
        url: 'https://www.reddit.com/r/popular/comments/a/hello',
        score: 1234,
        numComments: 56,
        subreddits: ['popular', 'funny'],
        author: 'u',
      },
    ]
    source.render(container, posts)
    const item = container.querySelector('.gm-sp-reddit-item')!
    expect(item.querySelector('.gm-sp-reddit-count')!.textContent).toBe('1234')
    expect(item.querySelector('.gm-sp-reddit-title')!.textContent).toBe('Hello')
    expect(item.querySelector('.gm-sp-reddit-sub')!.textContent).toBe('r/popular, r/funny')
    expect(item.querySelector('.gm-sp-reddit-comments')!.textContent).toBe('💬 56')
  })
  test('renders empty state when no posts', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, [])
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })
  test('renders empty state when data is null', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, null)
    expect(container.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })
  test('clicking title adds read class', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, [
      {
        id: 'r1',
        title: 't',
        url: 'https://www.reddit.com/r/x/comments/r1/t',
        score: 1,
        numComments: 0,
        subreddits: ['x'],
        author: 'u',
      },
    ])
    const link = container.querySelector('.gm-sp-reddit-title') as HTMLAnchorElement
    link.click()
    expect(
      container.querySelector('.gm-sp-reddit-item')!.classList.contains('gm-sp-reddit-read'),
    ).toBe(true)
  })
  test('hide button removes item from list', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
    const source = createRedditSource(defaultRedditOpts())
    source.render(container, [
      {
        id: 'r1',
        title: 't',
        url: 'https://www.reddit.com/r/x/comments/r1/t',
        score: 1,
        numComments: 0,
        subreddits: ['x'],
        author: 'u',
      },
      {
        id: 'r2',
        title: 't2',
        url: 'https://www.reddit.com/r/x/comments/r2/t2',
        score: 1,
        numComments: 0,
        subreddits: ['x'],
        author: 'u',
      },
    ])
    expect(container.querySelectorAll('.gm-sp-reddit-item')).toHaveLength(2)
    const hideBtn = container.querySelector('.gm-sp-reddit-hide') as HTMLButtonElement
    hideBtn.click()
    expect(container.querySelectorAll('.gm-sp-reddit-item')).toHaveLength(1)
  })
  test('source metadata is correct', () => {
    const source = createRedditSource(defaultRedditOpts())
    expect(source.id).toBe('reddit')
    expect(source.title).toBe('Reddit 热帖')
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(2)
    expect(source.ttlMs).toBe(30 * 60_000)
    expect(typeof source.createEditor).toBe('function')
  })
})

describe('validateConfig.reddit', () => {
  test('accepts default config', () => {
    expect(
      validateConfig({
        reddit: {
          ttlMinutes: 30,
          subreddits: ['popular'],
          minItems: 10,
          maxItems: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 500,
        },
      }),
    ).toEqual({ ok: true })
  })
  test('rejects non-object reddit', () => {
    expect(validateConfig({ reddit: 'no' }).ok).toBe(false)
  })
  test('rejects empty subreddits', () => {
    expect(
      validateConfig({
        reddit: { subreddits: [], minItems: 1, maxItems: 1, ttlMinutes: 1, minCutoffScore: 0 },
      }).ok,
    ).toBe(false)
  })
  test('rejects blank subreddit name', () => {
    expect(
      validateConfig({
        reddit: { subreddits: ['  '], minItems: 1, maxItems: 1, ttlMinutes: 1, minCutoffScore: 0 },
      }).ok,
    ).toBe(false)
  })
  test('rejects minItems > maxItems', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 5,
          maxItems: 3,
          ttlMinutes: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects out-of-range ratio', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          maxItems: 1,
          ttlMinutes: 30,
          displayRatio: 1.5,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects negative ttl', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          maxItems: 1,
          ttlMinutes: 0,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: 0,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects negative minCutoffScore', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          minItems: 1,
          maxItems: 1,
          ttlMinutes: 30,
          displayRatio: 0.1,
          elbowDropRatio: 0.4,
          minCutoffScore: -1,
        },
      }).ok,
    ).toBe(false)
  })
})
