import { describe, expect, test } from 'bun:test'
import { render, within } from '@testing-library/preact'
import { h } from 'preact'
import { validateConfig } from '../../../../src/prism/config'
import { loadCache, saveCache } from '../../../../src/prism/cache'
import { resetMetricsThrottle } from '../../../../src/prism/reddit/metrics'
import { createRedditSource } from '../../../../src/prism/reddit/source'
import { STATE_KEY, type CachedSource } from '../../../../src/prism/types'
import type { RedditPost, RedditSourceOptions } from '../../../../src/prism/reddit/types'
import type { RequestDetails } from '../../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../../runtime'

const DEFAULT_COUNT_OPTS = {
  todayMinComments: 10,
  olderMinComments: 20,
  ageHalfLifeDays: 2,
}

function defaultRedditOpts(over: Partial<RedditSourceOptions> = {}): RedditSourceOptions {
  return {
    ttlMinutes: 30,
    retentionDays: 7,
    subreddits: ['popular'],
    ...DEFAULT_COUNT_OPTS,
    ...over,
  }
}

/**
 * An Atom listing whose entries mirror the members named in the request URL, so
 * one handler serves every configured subreddit. Published "now" keeps entries
 * clear of the retention cutoff.
 */
function atomForUrl(url: string, publishedMs: number = Date.now()): string {
  const members = (url.match(/\/r\/([^/?]+)/)?.[1] ?? 'unknown').split('+')
  const stamp = new Date(publishedMs).toISOString()
  const body = members
    .map(
      (sub) => `<entry>
    <author><name>/u/u_${sub}</name></author>
    <category term="${sub}" label="r/${sub}"/>
    <id>t3_${sub}1</id>
    <link href="https://www.reddit.com/r/${sub}/comments/${sub}1/${sub}_post/"/>
    <published>${stamp}</published>
    <title>${sub} post</title>
  </entry>`,
    )
    .join('')
  return `<feed xmlns="http://www.w3.org/2005/Atom">${body}</feed>`
}

function makeRuntime(handler: (d: RequestDetails) => void): TestRuntime {
  const base = createRuntime()
  return {
    ...base,
    request: (d: RequestDetails) => {
      // Rotation tests assert on the sequence of feed URLs; answer the optional
      // metrics enrichment separately so it never enters that sequence.
      if (d.url.includes('arctic-shift.photon-reddit.com')) {
        d.onload({
          responseText: JSON.stringify({ data: [] }),
          status: 200,
          responseHeaders: '',
        })
        return
      }
      handler(d)
    },
  }
}

describe('createRedditSource', () => {
  test('source metadata is correct', () => {
    const source = createRedditSource(defaultRedditOpts())
    expect(source.id).toBe('reddit')
    expect(source.title).toBe('Reddit 热帖')
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(3)
    expect(source.ttlMs).toBe(30 * 60_000)
    expect(typeof source.createEditor).toBe('function')
  })
})

describe('createRedditSource rotation schedule', () => {
  const NOW = 1_700_000_000_000
  function cachedAt(fetchedAt: number): CachedSource<unknown> {
    return { schemaVersion: 1, data: {}, fetchedAt, error: '' }
  }

  test('polls one section per ttl/K so a full cycle fits inside the ttl', () => {
    const source = createRedditSource(
      defaultRedditOpts({ subreddits: ['a', 'b', 'c', 'd', 'e'], ttlMinutes: 30 }),
    )
    // 30min / 5 sections = 6min per section.
    expect(source.isDue!(cachedAt(NOW), NOW + 5 * 60_000)).toBe(false)
    expect(source.isDue!(cachedAt(NOW), NOW + 6 * 60_000)).toBe(true)
  })

  test('a single section still polls at the full ttl', () => {
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['a'], ttlMinutes: 30 }))
    expect(source.isDue!(cachedAt(NOW), NOW + 29 * 60_000)).toBe(false)
    expect(source.isDue!(cachedAt(NOW), NOW + 30 * 60_000)).toBe(true)
  })

  test('never polls faster than the feed throttle allows', () => {
    // 60 sections would ask for a 30s interval and get 429s on every tick.
    const many = Array.from({ length: 60 }, (_, i) => `s${i}`)
    const source = createRedditSource(defaultRedditOpts({ subreddits: many, ttlMinutes: 30 }))
    expect(source.isDue!(cachedAt(NOW), NOW + 59_000)).toBe(false)
    expect(source.isDue!(cachedAt(NOW), NOW + 60_000)).toBe(true)
  })

  test('is due when nothing has been cached yet', () => {
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['a'] }))
    expect(source.isDue!(null, NOW)).toBe(true)
  })

  test('ttl stays at the configured value so the staleness badge is unaffected', () => {
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['a', 'b', 'c'] }))
    expect(source.ttlMs).toBe(30 * 60_000)
  })
})

describe('createRedditSource.fetch reads fresh config', () => {
  test('fetch uses subreddits from CONFIG_KEY, not stale closure options', async () => {
    const fetchedUrls: string[] = []
    const runtime = makeRuntime((d) => {
      fetchedUrls.push(d.url)
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['popular'] }))
    runtime.stores['dashboard:v2:config'] = {
      reddit: { subreddits: ['funny'] },
    }
    const data = await source.fetch(runtime, undefined)
    expect(fetchedUrls.every((u) => u.includes('/r/funny/'))).toBe(true)
    expect(fetchedUrls.some((u) => u.includes('/r/popular/'))).toBe(false)
    expect(typeof data).toBe('object')
    expect(data).not.toBeInstanceOf(Array)
  })

  test('fetch falls back to closure options when CONFIG_KEY has no reddit config', async () => {
    const fetchedUrls: string[] = []
    const runtime = makeRuntime((d) => {
      fetchedUrls.push(d.url)
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['popular'] }))
    await source.fetch(runtime, undefined)
    expect(fetchedUrls.every((u) => u.includes('/r/popular/'))).toBe(true)
  })

  test('fetch returns a Map keyed by sub', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['funny', 'aww'] }))
    const data = await source.fetch(runtime, undefined)
    expect(data).not.toBeNull()
    expect(typeof data).toBe('object')
    expect(
      (data as Record<string, unknown>)['funny'] || (data as Record<string, unknown>)['aww'],
    ).toBeTruthy()
  })
})

describe('createRedditSource.render uses ctx.runtime when runtimeRef is null', () => {
  test('bugfix: clicking title persists read state even if fetch() was never called', () => {
    const runtime = createRuntime()
    const source = createRedditSource(defaultRedditOpts())

    const container = document.createElement('div')
    document.body.appendChild(container)
    const data: Record<string, RedditPost[]> = {
      aww: [
        {
          id: 'a1',
          title: 'test post',
          url: 'https://www.reddit.com/r/aww/comments/a1/t',
          score: 100,
          numComments: 5,
          author: 'u',
          created: Date.now(),
        },
      ],
    }

    // Simulate mount flow: render before any fetch() call
    render(
      h(source.RenderComponent, {
        data,
        root: undefined as any,
        runtime,
      }),
      { container },
    )

    const link = within(container).getByRole('link', { name: 'test post' }) as HTMLAnchorElement
    link.click()

    // The mark should be saved to storage via ctx.runtime
    const stored = runtime.stores[STATE_KEY('reddit')] as Record<string, { r?: number }> | undefined
    expect(stored?.['a1']?.r).toBeGreaterThan(0)
  })
})

describe('RedditComponent metric columns', () => {
  function renderWith(over: Partial<RedditPost>) {
    const runtime = createRuntime()
    const source = createRedditSource(defaultRedditOpts())
    const post: RedditPost = {
      id: 'a1',
      title: 'a post',
      url: 'https://www.reddit.com/r/aww/comments/a1/t',
      score: 0,
      numComments: 0,
      author: 'u',
      created: Date.now(),
      ...over,
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(
      h(source.RenderComponent, {
        data: { aww: [post] },
        root: undefined as never,
        runtime,
      }),
      { container },
    )
    return container
  }

  test('hides the comment count and score when the channel has no metrics', () => {
    const container = renderWith({ metrics: false })
    expect(within(container).queryByTitle('评论数')).toBeNull()
    expect(within(container).queryByTitle('得分')).toBeNull()
    document.body.innerHTML = ''
  })

  test('renders both columns when metrics are present', () => {
    const container = renderWith({ score: 42, numComments: 7 })
    expect(within(container).getByTitle('得分').textContent).toContain('42')
    expect(within(container).getByTitle('评论数').textContent).toBe('7')
    document.body.innerHTML = ''
  })
})

describe('createRedditSource with merged subs', () => {
  test('fetch keys both subs under one group and renders a single section', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(
      defaultRedditOpts({ subreddits: ['opencode+opencodecli'], todayMinComments: 0 }),
    )
    const data = await source.fetch(runtime, undefined)
    expect(Object.keys(data as Record<string, unknown>)).toEqual(['opencode+opencodecli'])

    const container = document.createElement('div')
    document.body.appendChild(container)
    render(h(source.RenderComponent, { data, root: undefined as never, runtime }), { container })
    expect(within(container).getByText('r/opencode + r/opencodecli')).not.toBeNull()
    expect(
      within(container)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['opencode post', 'opencodecli post'])
    document.body.innerHTML = ''
  })
})

describe('RedditComponent after a failed refresh', () => {
  function renderWith(error: string) {
    const runtime = createRuntime()
    const source = createRedditSource(defaultRedditOpts())
    const post: RedditPost = {
      id: 'old1',
      title: 'yesterday post',
      url: 'https://www.reddit.com/r/aww/comments/old1/t',
      score: 0,
      numComments: 0,
      author: 'u',
      // Outside the default 「今」 bucket: this is the cached history the user
      // must still be able to read after a failed refresh.
      created: Date.now() - 24 * 60 * 60 * 1000,
      metrics: false,
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    render(
      h(source.RenderComponent, {
        data: { aww: [post] },
        root: undefined as never,
        runtime,
        error,
      }),
      { container },
    )
    return container
  }

  test('the default 「今」 bucket hides cached history', () => {
    const container = renderWith('')
    expect(within(container).getByText('暂无数据')).not.toBeNull()
    document.body.innerHTML = ''
  })

  test('a failed refresh falls back to all history instead of showing none', () => {
    const container = renderWith('reddit: http 403 (r/programming)')
    expect(within(container).getByText('yesterday post')).not.toBeNull()
    expect(within(container).getByText('抓取失败，已显示全部历史')).not.toBeNull()
    document.body.innerHTML = ''
  })
})

describe('createRedditSource view-time metrics refresh', () => {
  test('opening the panel refreshes numbers on days-old cached history', async () => {
    resetMetricsThrottle()
    const now = Date.now()
    const base = createRuntime()
    const runtime = {
      ...base,
      request: (d: RequestDetails) => {
        if (d.url.includes('arctic-shift.photon-reddit.com')) {
          d.onload({
            responseText: JSON.stringify({
              data: [{ id: 'old1', score: 999, num_comments: 88 }],
            }),
            status: 200,
            responseHeaders: '',
          })
          return
        }
        d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
      },
    }
    const oldPost: RedditPost = {
      id: 'old1',
      title: 'three days ago',
      url: 'https://www.reddit.com/r/aww/comments/old1/t',
      score: 5,
      numComments: 1,
      author: 'u',
      created: now - 3 * 24 * 60 * 60 * 1000,
      metrics: true,
    }
    await saveCache(runtime, 'reddit', {
      data: { aww: [oldPost] },
      fetchedAt: now - 60_000,
      error: '',
    })

    // `loadState` runs before the panel renders in dashboard.open().
    await createRedditSource(defaultRedditOpts()).loadState!(runtime)

    // The panel must paint from cache first: no numbers change yet.
    const immediate = await loadCache<Record<string, RedditPost[]>>(runtime, 'reddit')
    expect(immediate!.data?.['aww']![0]!.score).toBe(5)

    // Metrics catch up on a timer, and the cache write repaints the group.
    const timers = runtime.activeTimeouts(1)
    expect(timers).toHaveLength(1)
    timers.forEach((timer) => runtime.runTimeout(timer.id))

    let cached = await loadCache<Record<string, RedditPost[]>>(runtime, 'reddit')
    for (let i = 0; i < 50 && cached?.data?.['aww']?.[0]?.score !== 999; i++) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0))
      cached = await loadCache<Record<string, RedditPost[]>>(runtime, 'reddit')
    }
    expect(cached!.data?.['aww']![0]).toMatchObject({ score: 999, numComments: 88 })
    // Must not reset fetchedAt, or the rotation schedule would drift.
    expect(cached!.fetchedAt).toBe(now - 60_000)
  })

  test('repeated loadState calls share one pending refresh', async () => {
    resetMetricsThrottle()
    const runtime = createRuntime()
    const source = createRedditSource(defaultRedditOpts())
    await source.loadState!(runtime)
    await source.loadState!(runtime)
    expect(runtime.activeTimeouts(1)).toHaveLength(1)
  })
})

describe('createRedditSource section rotation', () => {
  function pathOf(url: string): string {
    return new URL(url).pathname
  }

  test('covers one section per refresh and rotates through all of them', async () => {
    const paths: string[] = []
    const runtime = makeRuntime((d) => {
      paths.push(pathOf(d.url))
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['a', 'b', 'c'] }))
    let prev: Record<string, RedditPost[]> | undefined
    for (let round = 0; round < 4; round++) {
      prev = (await source.fetch(runtime, prev)) as Record<string, RedditPost[]>
    }
    // One section per request: the feed caps at 100 posts and shares that budget
    // between all members, so a request per section is what gives a quiet
    // subreddit its full share.
    expect(paths).toEqual(['/r/a/hot/.rss', '/r/b/hot/.rss', '/r/c/hot/.rss', '/r/a/hot/.rss'])
  })

  test('keeps the cached posts of sections skipped this round', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['a', 'b'] }))
    const first = (await source.fetch(runtime, undefined)) as Record<string, RedditPost[]>
    expect(Object.keys(first)).toEqual(['a'])

    const second = (await source.fetch(runtime, first)) as Record<string, RedditPost[]>
    expect(Object.keys(second).sort()).toEqual(['a', 'b'])
    // `a` was not fetched this round and must survive on its group key alone.
    expect(second['a']!.map((p) => p.id)).toEqual(['a1'])
    expect(second['b']!.map((p) => p.id)).toEqual(['b1'])
  })

  test('does not render a section that has neither cache nor a fetch yet', async () => {
    const runtime = makeRuntime((d) => {
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['a', 'b', 'c'] }))
    const first = (await source.fetch(runtime, undefined)) as Record<string, RedditPost[]>
    expect(Object.keys(first)).toEqual(['a'])
  })

  test('a failed round retries the same section instead of skipping it', async () => {
    const paths: string[] = []
    let failing = true
    const runtime = makeRuntime((d) => {
      paths.push(pathOf(d.url))
      if (failing) {
        d.onload({ responseText: '', status: 403, responseHeaders: '' })
        return
      }
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const source = createRedditSource(defaultRedditOpts({ subreddits: ['a', 'b'] }))
    await expect(source.fetch(runtime, undefined)).rejects.toThrow(/403/)
    failing = false
    await source.fetch(runtime, undefined)
    expect(paths).toEqual(['/r/a/hot/.rss', '/r/a/hot/.rss'])
  })

  test('the cursor survives a new source instance', async () => {
    const paths: string[] = []
    const runtime = makeRuntime((d) => {
      paths.push(pathOf(d.url))
      d.onload({ responseText: atomForUrl(d.url), status: 200, responseHeaders: '' })
    })
    const opts = defaultRedditOpts({ subreddits: ['a', 'b'] })
    await createRedditSource(opts).fetch(runtime, undefined)
    // Simulates a page reload: the in-memory source is gone, storage is not.
    await createRedditSource(opts).fetch(runtime, undefined)
    expect(paths).toEqual(['/r/a/hot/.rss', '/r/b/hot/.rss'])
  })
})

describe('validateConfig.reddit', () => {
  test('accepts default config', () => {
    expect(
      validateConfig({
        reddit: {
          ttlMinutes: 30,
          retentionDays: 7,
          todayMinComments: 10,
          olderMinComments: 20,
          ageHalfLifeDays: 2,
          subreddits: ['popular'],
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
        reddit: { subreddits: [], ttlMinutes: 1 },
      }).ok,
    ).toBe(false)
  })
  test('rejects blank subreddit name', () => {
    expect(
      validateConfig({
        reddit: { subreddits: ['  '], ttlMinutes: 1 },
      }).ok,
    ).toBe(false)
  })
  test('rejects negative ttl', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          ttlMinutes: 0,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects negative olderMinComments', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          ttlMinutes: 30,
          olderMinComments: -1,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects ageHalfLifeDays out of range', () => {
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          ttlMinutes: 30,
          ageHalfLifeDays: 0,
        },
      }).ok,
    ).toBe(false)
    expect(
      validateConfig({
        reddit: {
          subreddits: ['a'],
          ttlMinutes: 30,
          ageHalfLifeDays: 31,
        },
      }).ok,
    ).toBe(false)
  })
})
