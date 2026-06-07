import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchReddit } from '../../../../src/dashboard/reddit/fetcher'
import type { RedditSourceOptions } from '../../../../src/dashboard/reddit/types'
import type { Runtime, RequestDetails } from '../../../../src/runtime'
import { createRuntime } from '../../../runtime'

const DEFAULT_COUNT_OPTS = {
  minItems: 10,
  maxItems: 30,
  minPerSub: 1,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minCutoffScore: 500,
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
  const text = readFileSync(
    join(import.meta.dir, '..', '..', 'fixtures', 'reddit-popular.json'),
    'utf8',
  )
  return JSON.parse(text)
}

function makeRuntime(dom: JSDOM, handler: (d: RequestDetails) => void): Runtime {
  const base = createRuntime(dom)
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

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
