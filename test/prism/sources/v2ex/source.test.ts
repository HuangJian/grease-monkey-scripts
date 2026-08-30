import { describe, expect, test } from 'bun:test'
import { render, within } from '@testing-library/preact'
import { h } from 'preact'
import { createV2exSource } from '../../../../src/prism/v2ex/source'
import type { V2exSourceOptions, V2exTopic } from '../../../../src/prism/v2ex/types'
import type { RequestDetails } from '../../../../src/runtime'
import { STATE_KEY, type Source } from '../../../../src/prism/types'
import { loadCache, saveCache } from '../../../../src/prism/cache'
import { refreshSource } from '../../../../src/prism/app/refresh'
import { createRuntime, type TestRuntime } from '../../../runtime'

const DEFAULTS: V2exSourceOptions = {
  ttlMinutes: 30,
  retentionDays: 7,
  todayMinReplies: 10,
  olderMinReplies: 20,
  ageHalfLifeDays: 2,
}

describe('createV2exSource', () => {
  test('exposes source metadata', () => {
    const source = createV2exSource(DEFAULTS)
    expect(source.id).toBe('v2ex')
    expect(source.title).toBe('V2EX 热议')
    expect(source.ttlMs).toBe(30 * 60_000)
    expect(source.groupId).toBe('browse')
    expect(source.order).toBe(0)
  })

  test('ttlMs scales with ttlMinutes', () => {
    const source = createV2exSource({ ...DEFAULTS, ttlMinutes: 5 })
    expect(source.ttlMs).toBe(5 * 60_000)
  })

  test('createEditor returns an editor function', () => {
    const source = createV2exSource(DEFAULTS)
    const editor = source.createEditor?.({ tabTitle: '', priority: 0, badgeType: 'default' })
    expect(typeof editor).toBe('function')
  })

  test('render does not throw and renders items', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const source = createV2exSource(DEFAULTS)
    const data: V2exTopic[] = [
      {
        id: 1,
        title: 'A',
        url: 'https://www.v2ex.com/t/1',
        replies: 10,
        member: { username: 'alice' },
        node: { title: 'node-a' },
        sources: [],
        created: Date.now(),
      },
    ]
    render(
      h(source.RenderComponent, {
        data,
        root: undefined as any,
        runtime: createRuntime(),
      }),
      { container },
    )
    expect(within(container).getAllByRole('listitem')).toHaveLength(1)
  })

  test('fetch wires fetcher + state and returns visible topics', async () => {
    const runtime: TestRuntime = {
      ...createRuntime(),
      request: (d: RequestDetails) => {
        if (d.url.includes('hot.json')) {
          d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
        } else {
          d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
        }
      },
    }
    const source = createV2exSource({ ...DEFAULTS, todayMinReplies: 0 })
    const result = await source.fetch(runtime, undefined)
    expect(result).toEqual([])
    const stored = runtime.stores[STATE_KEY('v2ex')]
    expect(stored).toBeDefined()
  })

  test('fetch drops hidden topics from the result', async () => {
    const runtime: TestRuntime = {
      ...createRuntime(),
      request: (d: RequestDetails) => {
        if (d.url.includes('hot.json')) {
          d.onload({
            responseText: JSON.stringify([
              {
                id: 7,
                title: 'X',
                url: 'https://www.v2ex.com/t/7',
                replies: 100,
                member: { username: 'u' },
                node: { title: 'n' },
                sources: [],
              },
            ]),
            status: 200,
            responseHeaders: '',
          })
        } else {
          d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
        }
      },
    }
    runtime.stores[STATE_KEY('v2ex')] = { '7': { h: Date.now() } }
    const source = createV2exSource({ ...DEFAULTS, todayMinReplies: 1 })
    const result = await source.fetch(runtime, undefined)
    expect(result).toEqual([])
  })

  test('pruneExpiredCache correctly prunes old items from compressed cache', async () => {
    const runtime: TestRuntime = {
      ...createRuntime(),
      request: (d: RequestDetails) => {
        d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
      },
    }
    const now = Date.now()
    const retentionMs = DEFAULTS.retentionDays * 24 * 60 * 60 * 1000
    const oldTopic: V2exTopic = {
      id: 1,
      title: 'old',
      url: 'https://www.v2ex.com/t/1',
      replies: 50,
      member: { username: 'a' },
      node: { title: 'n' },
      created: now - retentionMs - 1000,
      sources: [],
    }
    const newTopic: V2exTopic = {
      id: 2,
      title: 'new',
      url: 'https://www.v2ex.com/t/2',
      replies: 50,
      member: { username: 'b' },
      node: { title: 'n' },
      created: now - 1000,
      sources: [],
    }
    // Save compressed cache — data stored with short field names (t, c, etc.)
    await saveCache(runtime, 'v2ex', {
      data: [oldTopic, newTopic],
      fetchedAt: now,
      error: '',
    })

    const source = createV2exSource({ ...DEFAULTS, todayMinReplies: 0, olderMinReplies: 0 })
    // fetch triggers pruneExpiredCache at the end
    await source.fetch(runtime, [oldTopic, newTopic])

    // Verify the old topic was pruned from the stored cache
    const cached = await loadCache<V2exTopic[]>(runtime, 'v2ex')
    const items = cached?.data ?? []
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe(2)
  })

  test('fetch does not return topics past the retention window', async () => {
    const runtime: TestRuntime = {
      ...createRuntime(),
      request: (d: RequestDetails) => {
        d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
      },
    }
    const now = Date.now()
    const retentionMs = DEFAULTS.retentionDays * 24 * 60 * 60 * 1000
    const make = (id: number, created: number): V2exTopic => ({
      id,
      title: `t${id}`,
      url: `https://www.v2ex.com/t/${id}`,
      replies: 50,
      member: { username: 'a' },
      node: { title: 'n' },
      created,
      sources: [],
    })
    const stale = make(1, now - retentionMs - 1000)
    const fresh = make(2, now - 1000)

    const source = createV2exSource({ ...DEFAULTS, todayMinReplies: 0, olderMinReplies: 0 })
    const result = await source.fetch(runtime, [stale, fresh])
    // The recovery path re-injects everything in prevData, so an expired topic
    // has to be filtered out of the result too — otherwise refreshSource writes
    // it straight back over pruneExpiredCache's trimmed snapshot.
    expect(result.map((t) => t.id)).toEqual([2])
  })

  test('purges legacy topics that lost their created time from the cache', async () => {
    const now = Date.now()
    const untimestamped: V2exTopic = {
      id: 1,
      title: 'legacy',
      url: 'https://www.v2ex.com/t/1',
      replies: 50,
      member: { username: 'a' },
      node: { title: 'n' },
      created: 0,
      sources: [],
    }
    const runtime: TestRuntime = {
      ...createRuntime(),
      request: (d: RequestDetails) => {
        d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
      },
    }
    await saveCache(runtime, 'v2ex', {
      data: [untimestamped],
      fetchedAt: now,
      error: '',
    })
    runtime.stores[STATE_KEY('v2ex')] = { '1': { r: Math.floor(now / 60000), n: 50 } }

    const source = createV2exSource({ ...DEFAULTS, todayMinReplies: 0, olderMinReplies: 0 })
    await source.fetch(runtime, [untimestamped])

    // created === 0 counts as expired, so the entry is dropped from the cache
    // and its (now orphaned) state is cleared with it.
    const cached = await loadCache<V2exTopic[]>(runtime, 'v2ex')
    expect(cached?.data ?? []).toEqual([])
    expect(runtime.stores[STATE_KEY('v2ex')]).toEqual({})
  })

  test('read state of a live topic survives repeated refreshSource calls', async () => {
    const now = Date.now()
    const retentionMs = DEFAULTS.retentionDays * 24 * 60 * 60 * 1000
    const topic = (id: number, created: number) => ({
      id,
      title: `t${id}`,
      url: `https://www.v2ex.com/t/${id}`,
      replies: 50,
      member: { username: 'a' },
      node: { title: 'n' },
      created: Math.floor(created / 1000),
    })
    // id 1 is 3 days old: inside the retention window, so it shows under 早
    const older = topic(1, now - 3 * 86400000)
    const runtime: TestRuntime = {
      ...createRuntime(),
      request: (d: RequestDetails) => {
        if (d.url.includes('hot.json')) {
          d.onload({
            responseText: JSON.stringify([older]),
            status: 200,
            responseHeaders: '',
          })
        } else {
          d.onload({ responseText: '[]', status: 200, responseHeaders: '' })
        }
      },
    }
    const source = createV2exSource({ ...DEFAULTS, todayMinReplies: 0, olderMinReplies: 0 })
    await refreshSource(runtime, source as unknown as Source<unknown>)

    const stateKey = STATE_KEY('v2ex')
    runtime.stores[stateKey] = { '1': { r: Math.floor(now / 60000), n: 50 } }

    await refreshSource(runtime, source as unknown as Source<unknown>)
    await refreshSource(runtime, source as unknown as Source<unknown>)

    // Regression: an old topic used to be resurrected by the recovery path on
    // every refresh while pruneExpiredCache deleted its read state, so anything
    // under 早 flipped back to unread.
    expect(runtime.stores[stateKey]).toEqual({ '1': { r: Math.floor(now / 60000), n: 50 } })
    expect(retentionMs).toBeGreaterThan(3 * 86400000)
  })
})
