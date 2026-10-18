import { describe, expect, test } from 'bun:test'
import { refreshSource } from '../../../../src/prism/app/refresh'
import { loadCache } from '../../../../src/prism/cache'
import { createHupuSource, type HupuRenderData } from '../../../../src/prism/hupu/source'
import type { HupuPost, HupuSourceOptions } from '../../../../src/prism/hupu/types'
import type { Source } from '../../../../src/prism/types'
import { createRuntime } from '../../../runtime'

const BOARD = 'vote-hot'
const BOARD_URL = `https://bbs.hupu.com/${BOARD}`

const OPTIONS: HupuSourceOptions = {
  ttlMinutes: 30,
  retentionDays: 7,
  boards: [BOARD],
  todayMinReplies: 10,
  olderMinReplies: 20,
  ageHalfLifeDays: 2,
  lightsWeight: 1,
  repliesWeight: 1,
}

type Thread = {
  tid: string
  title: string
  url: string
  lights: number
  replies: number
  read: number
  createdAt: number
  author: { puname: string; url: string }
  topic: { name: string }
}

function thread(tid: string, replies: number, createdAt: number): Thread {
  return {
    tid,
    title: `T${tid}`,
    url: `/${tid}.html`,
    lights: 10,
    replies,
    read: 1000,
    createdAt,
    author: { puname: 'u1', url: 'https://my.hupu.com/1' },
    topic: { name: '湿乎乎的话题' },
  }
}

/** Board page whose only real content is the inline `window.$$data` payload. */
function pageWith(threads: Thread[]): string {
  const json = JSON.stringify({ topic: { threads: { list: threads } } })
  return `<!doctype html><html><head><script>window.$$data = ${json};</script></head><body></body></html>`
}

function idsOf(data: HupuRenderData | null | undefined): string[] {
  if (!data) return []
  return Object.values(data)
    .flatMap((posts) => posts.map((p) => p.id))
    .sort()
}

describe('createHupuSource', () => {
  test('exposes source metadata', () => {
    const source = createHupuSource(OPTIONS)
    expect(source.id).toBe('hupu')
    expect(source.title).toBe('虎扑热帖')
    expect(source.ttlMs).toBe(30 * 60_000)
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(4)
  })

  test('a topic that rolls off the board page survives the next refresh', async () => {
    const now = Date.now()
    const runtime = createRuntime()
    const source = createHupuSource(OPTIONS)

    runtime.queueResponse(BOARD_URL, pageWith([thread('1', 30, now), thread('2', 30, now)]))
    await refreshSource(runtime, source as unknown as Source<unknown>)
    const first = await loadCache<HupuRenderData>(runtime, 'hupu')
    expect(idsOf(first?.data)).toEqual(['1', '2'])

    // The board page rolls over: thread 1 is no longer listed upstream.
    runtime.queueResponse(BOARD_URL, pageWith([thread('2', 30, now)]))
    await refreshSource(runtime, source as unknown as Source<unknown>)
    const second = await loadCache<HupuRenderData>(runtime, 'hupu')

    // Regression: the post must be recovered from the previous cache entry.
    expect(idsOf(second?.data)).toEqual(['1', '2'])
  })

  test('cache round-trip keeps the grouped shape and the rendered fields', async () => {
    const now = Date.now()
    const runtime = createRuntime()
    const source = createHupuSource(OPTIONS)

    runtime.queueResponse(BOARD_URL, pageWith([thread('1', 30, now)]))
    await refreshSource(runtime, source as unknown as Source<unknown>)
    const cached = await loadCache<HupuRenderData>(runtime, 'hupu')
    const post = cached?.data?.[BOARD]?.[0] as HupuPost

    // The board lives on the group key, not on the post: the hupu codec
    // compresses it away, so anything downstream must read the key.
    expect(Object.keys(cached?.data ?? {})).toEqual([BOARD])
    expect(post.id).toBe('1')
    expect(post.title).toBe('T1')
    expect(post.url).toBe(`https://bbs.hupu.com/1.html`)
    expect(post.lights).toBe(10)
    expect(post.replies).toBe(30)
    expect(post.author).toBe('u1')
    // minute precision is the codec's contract
    expect(Math.abs(post.created - now)).toBeLessThan(60_000)
  })
})
