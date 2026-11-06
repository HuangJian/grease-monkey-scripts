import { beforeEach, describe, expect, test } from 'bun:test'
import {
  enrichRedditMetrics,
  METRICS_REFRESH_MIN_INTERVAL_MS,
  REDDIT_METRICS_URL,
  refreshMetricsForData,
  resetMetricsThrottle,
} from '../../../../src/prism/reddit/metrics'
import type { RedditPost } from '../../../../src/prism/reddit/types'
import type { RequestDetails } from '../../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../../runtime'

function post(id: string, over: Partial<RedditPost> = {}): RedditPost {
  return {
    id,
    title: id,
    url: `https://www.reddit.com/r/x/comments/${id}/t`,
    score: 0,
    numComments: 0,
    author: 'u',
    created: Date.now(),
    metrics: false,
    ...over,
  }
}

function runtimeWith(handler: (d: RequestDetails) => void): TestRuntime {
  const base = createRuntime()
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

function archive(rows: unknown[]): string {
  return JSON.stringify({ data: rows })
}

describe('REDDIT_METRICS_URL', () => {
  test('joins ids into one batch request and asks only for the used fields', () => {
    expect(REDDIT_METRICS_URL(['a1', 'b2'])).toBe(
      'https://arctic-shift.photon-reddit.com/api/posts/ids?ids=a1,b2&fields=id,score,num_comments',
    )
  })
})

describe('enrichRedditMetrics', () => {
  test('fills score and comment counts by id', async () => {
    let captured: RequestDetails | undefined
    const runtime = runtimeWith((d) => {
      captured = d
      d.onload({
        responseText: archive([
          { id: 'a1', score: 1875, num_comments: 339 },
          { id: 'b2', score: 18.9, num_comments: 4 },
        ]),
        status: 200,
        responseHeaders: '',
      })
    })
    const posts = [post('a1'), post('b2')]
    const count = await enrichRedditMetrics(runtime, posts)
    expect(count).toBe(2)
    expect(posts[0]).toMatchObject({ score: 1875, numComments: 339, metrics: true })
    // Fractional archive values are floored, never displayed as decimals.
    expect(posts[1]).toMatchObject({ score: 18, numComments: 4, metrics: true })
    expect(captured!.anonymous).toBe(true)

    // Test coverage gap: this lint guard makes sure the assertions above are not
    // accidentally vacuous — the URL must carry both ids.
    expect(captured!.url).toContain('ids=a1,b2')
  })

  test('leaves posts the archive has not ingested alone', async () => {
    const runtime = runtimeWith((d) =>
      d.onload({
        responseText: archive([{ id: 'a1', score: 10, num_comments: 2 }]),
        status: 200,
        responseHeaders: '',
      }),
    )
    const posts = [post('a1'), post('missing')]
    expect(await enrichRedditMetrics(runtime, posts)).toBe(1)
    expect(posts[1]).toMatchObject({ score: 0, numComments: 0, metrics: false })
  })

  test('does not request ids that already carry metrics', async () => {
    let calls = 0
    let url = ''
    const runtime = runtimeWith((d) => {
      calls++
      url = d.url
      d.onload({ responseText: archive([]), status: 200, responseHeaders: '' })
    })
    const posts = [post('a1', { metrics: true, score: 50, numComments: 7 }), post('b2')]
    await enrichRedditMetrics(runtime, posts)
    expect(calls).toBe(1)
    expect(url).toContain('ids=b2')
    expect(url).not.toContain('a1')
    expect(posts[0]).toMatchObject({ score: 50, numComments: 7 })
  })

  test('skips the request entirely when every post has metrics', async () => {
    let calls = 0
    const runtime = runtimeWith(() => {
      calls++
    })
    expect(await enrichRedditMetrics(runtime, [post('a1', { metrics: true })])).toBe(0)
    expect(calls).toBe(0)
  })

  test('ignores rows with non-numeric or missing values', async () => {
    const runtime = runtimeWith((d) =>
      d.onload({
        responseText: archive([
          { id: 'a1', score: 'nope', num_comments: 3 },
          { id: 'b2', score: 10 },
          { id: 'c3', score: -5, num_comments: -1 },
        ]),
        status: 200,
        responseHeaders: '',
      }),
    )
    const posts = [post('a1'), post('b2'), post('c3')]
    expect(await enrichRedditMetrics(runtime, posts)).toBe(1)
    expect(posts[0]!.metrics).toBe(false)
    expect(posts[1]!.metrics).toBe(false)
    expect(posts[2]).toMatchObject({ score: 0, numComments: 0, metrics: true })
  })

  test('degrades silently on an http error', async () => {
    const runtime = runtimeWith((d) =>
      d.onload({ responseText: '', status: 503, responseHeaders: '' }),
    )
    const posts = [post('a1')]
    expect(await enrichRedditMetrics(runtime, posts)).toBe(0)
    expect(posts[0]!.metrics).toBe(false)
  })

  test('degrades silently on malformed json', async () => {
    const runtime = runtimeWith((d) =>
      d.onload({ responseText: '<html>challenge</html>', status: 200, responseHeaders: '' }),
    )
    expect(await enrichRedditMetrics(runtime, [post('a1')])).toBe(0)
  })

  test('degrades silently on network error and timeout', async () => {
    const failing = runtimeWith((d) => d.onerror?.())
    expect(await enrichRedditMetrics(failing, [post('a1')])).toBe(0)
    const timingOut = runtimeWith((d) => d.ontimeout?.())
    expect(await enrichRedditMetrics(timingOut, [post('a1')])).toBe(0)
  })

  test('force re-queries posts that already carry metrics', async () => {
    let url = ''
    const runtime = runtimeWith((d) => {
      url = d.url
      d.onload({
        responseText: archive([{ id: 'a1', score: 777, num_comments: 42 }]),
        status: 200,
        responseHeaders: '',
      })
    })
    const p = post('a1', { metrics: true, score: 5, numComments: 1 })
    expect(await enrichRedditMetrics(runtime, [p], { force: true })).toBe(1)
    expect(url).toContain('ids=a1')
    expect(p).toMatchObject({ score: 777, numComments: 42, metrics: true })
  })

  test('splits more than 500 ids across sequential requests', async () => {
    // The archive rejects the whole batch with http 400 above 500 ids:
    // "'ids' must be a comma-separated list of 0-500 base36-encoded numbers".
    const calls: string[] = []
    const runtime = runtimeWith((d) => {
      calls.push(d.url)
      const ids = new URL(d.url).searchParams.get('ids')?.split(',') ?? []
      d.onload({
        responseText: archive(ids.map((id) => ({ id, score: 7, num_comments: 3 }))),
        status: 200,
        responseHeaders: '',
      })
    })
    const posts = Array.from({ length: 620 }, (_, i) => post(`p${i}`))
    expect(await enrichRedditMetrics(runtime, posts)).toBe(620)
    expect(calls).toHaveLength(2)
    expect(new URL(calls[0]!).searchParams.get('ids')!.split(',')).toHaveLength(500)
    expect(new URL(calls[1]!).searchParams.get('ids')!.split(',')).toHaveLength(120)
    expect(posts.every((p) => p.metrics === true && p.score === 7)).toBe(true)
  })
})

describe('refreshMetricsForData', () => {
  beforeEach(() => resetMetricsThrottle())

  test('refreshes every section, including days-old cached posts', async () => {
    let url = ''
    const runtime = runtimeWith((d) => {
      url = d.url
      d.onload({
        responseText: archive([
          { id: 'old1', score: 999, num_comments: 88 },
          { id: 'new1', score: 12, num_comments: 3 },
        ]),
        status: 200,
        responseHeaders: '',
      })
    })
    const data = {
      a: [
        post('old1', {
          metrics: true,
          score: 5,
          numComments: 1,
          created: Date.now() - 3 * 24 * 60 * 60 * 1000,
        }),
      ],
      b: [post('new1')],
    }
    expect(await refreshMetricsForData(runtime, data, 1_000_000)).toBe(true)
    expect(url).toContain('old1')
    expect(url).toContain('new1')
    expect(data.a[0]).toMatchObject({ score: 999, numComments: 88, metrics: true })
    expect(data.b[0]).toMatchObject({ score: 12, numComments: 3, metrics: true })
  })

  test('dedupes an id present in more than one section', async () => {
    let url = ''
    const runtime = runtimeWith((d) => {
      url = d.url
      d.onload({ responseText: archive([]), status: 200, responseHeaders: '' })
    })
    await refreshMetricsForData(runtime, { a: [post('dup')], b: [post('dup')] }, 1_000_000)
    expect(url).toContain('ids=dup')
    expect(url).not.toContain('dup,dup')
  })

  test('cooldown skips a repeat refresh, unless a post has no numbers yet', async () => {
    let calls = 0
    const runtime = runtimeWith((d) => {
      calls++
      d.onload({ responseText: archive([]), status: 200, responseHeaders: '' })
    })
    const allMeasured = { a: [post('x', { metrics: true, score: 5, numComments: 1 })] }
    await refreshMetricsForData(runtime, allMeasured, 1_000_000)
    await refreshMetricsForData(runtime, allMeasured, 1_000_000 + 60_000)
    expect(calls).toBe(1)

    // A fresh post without numbers must not be left blank just because of the
    // cooldown — it wins over the throttle.
    await refreshMetricsForData(runtime, { a: [...allMeasured.a, post('y')] }, 1_000_000 + 120_000)
    expect(calls).toBe(2)
  })

  test('a refresh is allowed again after the cooldown', async () => {
    let calls = 0
    const runtime = runtimeWith((d) => {
      calls++
      d.onload({ responseText: archive([]), status: 200, responseHeaders: '' })
    })
    const data = { a: [post('x', { metrics: true, score: 5, numComments: 1 })] }
    await refreshMetricsForData(runtime, data, 1_000_000)
    await refreshMetricsForData(runtime, data, 1_000_000 + METRICS_REFRESH_MIN_INTERVAL_MS)
    expect(calls).toBe(2)
  })

  test('a post the archive omits keeps its previous numbers', async () => {
    const runtime = runtimeWith((d) =>
      d.onload({ responseText: archive([]), status: 200, responseHeaders: '' }),
    )
    const p = post('x', { metrics: true, score: 123, numComments: 45 })
    await refreshMetricsForData(runtime, { a: [p] }, 1_000_000)
    expect(p).toMatchObject({ score: 123, numComments: 45, metrics: true })
  })
})
