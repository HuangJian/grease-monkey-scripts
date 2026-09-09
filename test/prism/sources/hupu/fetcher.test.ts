import { describe, expect, test } from 'bun:test'
import { fetchHupu } from '../../../../src/prism/hupu/fetcher'
import { createRuntime } from '../../../runtime'

const BOARD = 'vote-hot'
const BOARD_URL = `https://bbs.hupu.com/${BOARD}`

const OPTIONS = {
  ttlMinutes: 60,
  retentionDays: 7,
  boards: [BOARD],
  todayMinReplies: 0,
  olderMinReplies: 0,
  ageHalfLifeDays: 1,
  lightsWeight: 1,
  repliesWeight: 1,
}

const THREAD = {
  tid: '639900526',
  title: 'Test Post',
  url: '/639900526.html',
  lights: 50,
  replies: 315,
  read: 270747,
  createdAt: 1781235056000,
  author: { puname: 'user1', url: 'https://my.hupu.com/123' },
  topic: { name: '湿乎乎的话题', url: '/vote' },
}

/** Minimal board page whose only real content is the inline `$$data` payload. */
function pageWithData(json: string): string {
  return `<!doctype html><html><head><script>window.$$data = ${json};</script></head><body></body></html>`
}

describe('fetchHupu — window.$$data extraction (§3.5)', () => {
  test('parses posts out of the inline payload', async () => {
    const runtime = createRuntime()
    runtime.queueResponse(
      BOARD_URL,
      pageWithData(JSON.stringify({ topic: { threads: { list: [THREAD] } } })),
    )
    const result = await fetchHupu(runtime, OPTIONS)
    const posts = result.boards[0]!.posts
    expect(posts.map((p) => p.id)).toContain('639900526')
    expect(posts.find((p) => p.id === '639900526')!.title).toBe('Test Post')
  })

  test('payload may nest braces and end with a trailing semicolon', async () => {
    const runtime = createRuntime()
    const json = JSON.stringify({
      topic: { threads: { list: [THREAD] } },
      extra: { deep: { nested: '{not a closing brace}' } },
    })
    runtime.queueResponse(BOARD_URL, pageWithData(json))
    const result = await fetchHupu(runtime, OPTIONS)
    expect(result.boards[0]!.posts.map((p) => p.id)).toContain('639900526')
  })

  test('falls through to an error when the payload is not valid JSON', async () => {
    const runtime = createRuntime()
    runtime.queueResponse(BOARD_URL, pageWithData('{oops'))
    await expect(fetchHupu(runtime, OPTIONS)).rejects.toThrow('all boards failed')
  })
})
