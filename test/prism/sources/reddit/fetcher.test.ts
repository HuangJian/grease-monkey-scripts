import { describe, expect, test } from 'bun:test'
import { fetchReddit } from '../../../../src/prism/reddit/fetcher'
import type { RedditSourceOptions } from '../../../../src/prism/reddit/types'
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

/** Minimal Atom listing shaped like reddit's `/r/a+b/hot/.rss`. */
function atomFeed(entries: ReadonlyArray<[sub: string, id: string]>): string {
  const body = entries
    .map(
      ([sub, id]) => `<entry>
    <author><name>/u/u_${id}</name></author>
    <category term="${sub}" label="r/${sub}"/>
    <id>t3_${id}</id>
    <link href="https://www.reddit.com/r/${sub}/comments/${id}/${id}/"/>
    <updated>2026-11-03T16:31:27+00:00</updated>
    <published>2026-11-03T16:31:27+00:00</published>
    <title>${id} title</title>
  </entry>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom">${body}</feed>`
}

function makeRuntime(handler: (d: RequestDetails) => void): TestRuntime {
  const base = createRuntime()
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

/**
 * Fire the backoff scheduled by the 429 retry path.
 *
 * Delays above 100ms never auto-fire on the test runtime's fake clock
 * (`AUTO_FIRE_MAX_DELAY_MS`), so a retry would otherwise stall until the
 * runner's timeout. Poll for the scheduled timer and run it by hand.
 */
async function drainRetries(runtime: TestRuntime, attempt = 0): Promise<void> {
  const pending = runtime.activeTimeouts(1)
  if (pending.length > 0) {
    pending.forEach((timer) => runtime.runTimeout(timer.id))
    return
  }
  if (attempt >= 20) throw new Error('drainRetries: no retry was scheduled')
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0))
  return drainRetries(runtime, attempt + 1)
}

describe('fetchReddit', () => {
  test('covers every configured sub with a single multi-sub feed request', async () => {
    const calls: RequestDetails[] = []
    const runtime = makeRuntime((d) => {
      calls.push(d)
      d.onload({
        responseText: atomFeed([
          ['popular', 'p1'],
          ['funny', 'f1'],
        ]),
        status: 200,
        responseHeaders: '',
      })
    })
    const result = await fetchReddit(
      runtime,
      defaultRedditOpts({ subreddits: ['popular', 'funny'] }),
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://www.reddit.com/r/popular+funny/hot/.rss?limit=100')
    expect(result.posts.map((p) => p.sub)).toEqual(['popular', 'funny'])
    expect(result.posts[1]!.posts.map((p) => p.id)).toEqual(['f1'])
  })

  test('sends the custom User-Agent, an Atom Accept header, and session cookies', async () => {
    let captured: RequestDetails | undefined
    const runtime = makeRuntime((d) => {
      captured = d
      d.onload({ responseText: atomFeed([['popular', 'p1']]), status: 200, responseHeaders: '' })
    })
    await fetchReddit(runtime, defaultRedditOpts())
    expect(captured!.anonymous).toBe(false)
    expect(captured!.headers?.['User-Agent']).toMatch(/^web:grease-monkey-dashboard:/)
    expect(captured!.headers?.['Accept']).toContain('application/atom+xml')
  })

  test('parsed posts are left unmeasured for the view-time refresh', async () => {
    const runtime = makeRuntime((d) =>
      d.onload({ responseText: atomFeed([['popular', 'p1']]), status: 200, responseHeaders: '' }),
    )
    const [bucket] = (await fetchReddit(runtime, defaultRedditOpts())).posts
    expect(bucket!.posts[0]!.metrics).toBe(false)
    expect(bucket!.posts[0]!.score).toBe(0)
  })

  test('merges a "+" group into one bucket fed by every member', async () => {
    const runtime = makeRuntime((d) =>
      d.onload({
        responseText: atomFeed([
          ['opencode', 'o1'],
          ['opencodecli', 'c1'],
        ]),
        status: 200,
        responseHeaders: '',
      }),
    )
    const result = await fetchReddit(
      runtime,
      defaultRedditOpts({ subreddits: ['opencodecli+opencode'] }),
    )
    expect(result.posts).toHaveLength(1)
    expect(result.posts[0]!.sub).toBe('opencode+opencodecli')
    expect(result.posts[0]!.posts.map((p) => p.id)).toEqual(['o1', 'c1'])
  })

  test('a member missing from the feed does not fail the fetch', async () => {
    const runtime = makeRuntime((d) =>
      d.onload({ responseText: atomFeed([['popular', 'p1']]), status: 200, responseHeaders: '' }),
    )
    const result = await fetchReddit(
      runtime,
      defaultRedditOpts({ subreddits: ['popular', 'quiet'] }),
    )
    expect(result.posts.map((p) => p.sub)).toEqual(['popular'])
    expect(result.partialErrors).toEqual([])
  })

  test('normalizes and dedupes subreddit names before building the url', async () => {
    const urls: string[] = []
    const runtime = makeRuntime((d) => {
      urls.push(d.url)
      d.onload({ responseText: atomFeed([['funny', 'f1']]), status: 200, responseHeaders: '' })
    })
    await fetchReddit(runtime, defaultRedditOpts({ subreddits: ['/r/Funny', 'r/funny'] }))
    expect(urls).toEqual(['https://www.reddit.com/r/funny/hot/.rss?limit=100'])
  })

  test('throws when the feed carries no recognizable posts', async () => {
    const runtime = makeRuntime((d) =>
      d.onload({
        responseText: '<html><body>challenge</body></html>',
        status: 200,
        responseHeaders: '',
      }),
    )
    await expect(fetchReddit(runtime, defaultRedditOpts())).rejects.toThrow(
      /feed carried no recognizable posts/,
    )
  })

  test('throws on 403 with the sub list in the message', async () => {
    const runtime = makeRuntime((d) =>
      d.onload({ responseText: '', status: 403, responseHeaders: '' }),
    )
    await expect(
      fetchReddit(runtime, defaultRedditOpts({ subreddits: ['popular', 'funny'] })),
    ).rejects.toThrow(/http 403.*r\/popular.*r\/funny/)
  })

  test('does not retry a 500', async () => {
    let calls = 0
    const runtime = makeRuntime((d) => {
      calls++
      d.onload({ responseText: '', status: 500, responseHeaders: '' })
    })
    await expect(fetchReddit(runtime, defaultRedditOpts())).rejects.toThrow(/http 500/)
    expect(calls).toBe(1)
  })

  test('retries a 429 once, waiting out x-ratelimit-reset', async () => {
    let calls = 0
    const runtime = makeRuntime((d) => {
      calls++
      if (calls === 1) {
        d.onload({ responseText: '', status: 429, responseHeaders: 'x-ratelimit-reset: 42\n' })
        return
      }
      d.onload({ responseText: atomFeed([['popular', 'p1']]), status: 200, responseHeaders: '' })
    })
    const pending = fetchReddit(runtime, defaultRedditOpts())
    await drainRetries(runtime)
    const result = await pending
    expect(calls).toBe(2)
    expect(result.posts[0]!.posts[0]!.id).toBe('p1')
  })

  test('429 on both attempts throws http 429', async () => {
    const runtime = makeRuntime((d) =>
      d.onload({ responseText: '', status: 429, responseHeaders: 'x-ratelimit-reset: 30\n' }),
    )
    const pending = fetchReddit(runtime, defaultRedditOpts())
    await drainRetries(runtime)
    await expect(pending).rejects.toThrow(/http 429/)
  })

  test('network error and timeout are surfaced as fetch errors', async () => {
    const failing = makeRuntime((d) => d.onerror?.())
    await expect(fetchReddit(failing, defaultRedditOpts())).rejects.toThrow(/network error/)
    const timingOut = makeRuntime((d) => d.ontimeout?.())
    await expect(fetchReddit(timingOut, defaultRedditOpts())).rejects.toThrow(/timeout/)
  })
})
