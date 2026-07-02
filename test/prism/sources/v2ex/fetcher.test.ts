import { beforeEach, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchV2ex } from '../../../../src/prism/v2ex/fetcher'
import { createV2exState } from '../../../../src/prism/v2ex/state'
import type { V2exCountOptions } from '../../../../src/prism/v2ex/types'
import type { Runtime, RequestDetails } from '../../../../src/runtime'
import { createRuntime } from '../../../runtime'

const FIXTURE = [
  {
    id: 1,
    title: 'A',
    url: 'https://www.v2ex.com/t/1',
    replies: 10,
    member: { username: 'alice' },
    node: { title: 'node-a' },
    sources: [],
    created: Date.now() - 24 * 60 * 60 * 1000,
  },
  {
    id: 2,
    title: 'B',
    url: 'https://www.v2ex.com/t/2',
    replies: 20,
    member: { username: 'bob' },
    node: { title: 'node-b' },
    sources: [],
    created: Date.now() - 24 * 60 * 60 * 1000,
  },
  {
    id: 3,
    title: 'C',
    url: 'https://www.v2ex.com/t/3',
    replies: 30,
    member: { username: 'carol' },
    node: { title: 'node-c' },
    sources: [],
    created: Date.now() - 24 * 60 * 60 * 1000,
  },
]

const DEFAULT_COUNT_OPTS: V2exCountOptions = {
  todayMinReplies: 10,
  olderMinReplies: 20,
  ageHalfLifeDays: 2,
}

function makeRuntime(handler: (d: RequestDetails) => void): Runtime {
  const base = createRuntime()
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

function loadPageFixture(): string {
  return readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'v2ex-hot-page.html'), 'utf8')
}

describe('fetchV2ex', () => {
  beforeEach(() => {
    /* fresh state per test */
  })

  test('resolves with merged topics from both sources', async () => {
    const html = loadPageFixture()
    const runtime = makeRuntime((d) => {
      if (d.url.includes('hot.json')) {
        d.onload({ responseText: JSON.stringify(FIXTURE), status: 200, responseHeaders: '' })
      } else {
        d.onload({ responseText: html, status: 200, responseHeaders: '' })
      }
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const topics = await fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)
    expect(topics.length).toBeGreaterThan(0)
    const ids = topics.map((t) => t.id)
    expect(ids).toContain(1217291)
  })

  test('uses anonymous: true on both calls', async () => {
    const captured: RequestDetails[] = []
    const runtime = makeRuntime((d) => {
      captured.push(d)
      d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    await fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)
    expect(captured).toHaveLength(2)
    for (const c of captured) expect(c.anonymous).toBe(true)
  })

  test('rejects with combined error when both sources fail', async () => {
    const runtime = makeRuntime((d) => d.onerror?.())
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    await expect(fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)).rejects.toThrow(
      /v2ex api/,
    )
  })

  test('falls back to page when api fails', async () => {
    const html = loadPageFixture()
    const runtime = makeRuntime((d) => {
      if (d.url.includes('hot.json')) d.onerror?.()
      else d.onload({ responseText: html, status: 200, responseHeaders: '' })
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const topics = await fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)
    const pageTopic = topics.find((t) => t.id === 1217291)
    expect(pageTopic).toBeDefined()
    // 页面独占主题 created=首次抓取时间，保持 ['page'] 源
    expect(pageTopic!.sources).toEqual(['page'])
  })

  test('page-only topics stay as page source (no auto-promotion)', async () => {
    // 页面源 created 为首次抓取时间（span[title] 是 last_touched 而非创建时间），
    // 不触发基于 created 的自动晋升。页面独占主题保持 ['page'] 源。
    const html = `<html><body><div class="cell item"><a class="topic-link" href="/t/9999">Yesterday topic</a><span class="topic_info"><span title="2026-01-01 12:00:00 +00:00">1 day ago</span></span><span class="count_orange">50</span></div></body></html>`

    const runtime = makeRuntime((d) => {
      if (d.url.includes('hot.json'))
        d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
      else d.onload({ responseText: html, status: 200, responseHeaders: '' })
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const topics = await fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)
    const pageOnly = topics.find((t) => t.id === 9999)
    expect(pageOnly).toBeDefined()
    expect(pageOnly!.sources).toEqual(['page'])
    expect(pageOnly!.created).toBeGreaterThan(0)
  })

  test('today page-only topics stay as page source', async () => {
    const html = `<html><body><div class="cell item"><a class="topic-link" href="/t/8888">Today topic</a><span class="topic_info"><span title="2026-07-02 12:00:00 +00:00">1 hour ago</span></span><span class="count_orange">10</span></div></body></html>`

    const runtime = makeRuntime((d) => {
      if (d.url.includes('hot.json'))
        d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
      else d.onload({ responseText: html, status: 200, responseHeaders: '' })
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const topics = await fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)
    const notPromoted = topics.find((t) => t.id === 8888)
    expect(notPromoted).toBeDefined()
    expect(notPromoted!.sources).toEqual(['page'])
  })

  test('falls back to api when page fails', async () => {
    const runtime = makeRuntime((d) => {
      if (d.url.includes('hot.json')) {
        d.onload({ responseText: JSON.stringify(FIXTURE), status: 200, responseHeaders: '' })
      } else {
        d.onerror?.()
      }
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const topics = await fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)
    const apiTopic = topics.find((t) => t.id === 1)
    expect(apiTopic).toBeDefined()
    expect(apiTopic!.sources).toEqual(['api'])
  })

  test('marks cross-source topics when both have the same id', async () => {
    const html = loadPageFixture()
    const sharedTopic = {
      id: 1217291,
      title: 'shared',
      url: 'https://www.v2ex.com/t/1217291',
      replies: 5,
      member: { username: 'u' },
      node: { title: 'n' },
      sources: [],
    }
    const runtime = makeRuntime((d) => {
      if (d.url.includes('hot.json')) {
        d.onload({ responseText: JSON.stringify([sharedTopic]), status: 200, responseHeaders: '' })
      } else {
        d.onload({ responseText: html, status: 200, responseHeaders: '' })
      }
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const topics = await fetchV2ex(runtime, DEFAULT_COUNT_OPTS, new DOMParser(), state)
    const shared = topics.find((t) => t.id === 1217291)
    expect(shared).toBeDefined()
    expect(shared!.sources).toEqual(['api', 'page'])
  })

  test('filters out today page topics with replies below todayMinReplies', async () => {
    const lowReplyTopic = {
      id: 999,
      title: 'Low reply',
      url: 'https://www.v2ex.com/t/999',
      replies: 2,
      member: { username: 'u' },
      node: { title: 'n' },
      sources: [],
      created: Date.now(),
    }
    const runtime = makeRuntime((d) => {
      if (d.url.includes('hot.json')) {
        d.onload({ responseText: JSON.stringify([FIXTURE[0]]), status: 200, responseHeaders: '' })
      } else {
        d.onload({
          responseText: JSON.stringify([FIXTURE[0], lowReplyTopic]),
          status: 200,
          responseHeaders: '',
        })
      }
    })
    const state = createV2exState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
    const topics = await fetchV2ex(
      runtime,
      { ...DEFAULT_COUNT_OPTS, todayMinReplies: 5 },
      new DOMParser(),
      state,
    )
    expect(topics.find((t) => t.id === 999)).toBeUndefined()
  })

  // history recovery is tested via prevById in source integration tests
})
