import { describe, expect, test } from 'bun:test'
import { render, within } from '@testing-library/preact'
import { h } from 'preact'
import { createV2exSource } from '../../../../src/dashboard/v2ex/source'
import type { V2exSourceOptions, V2exTopic } from '../../../../src/dashboard/v2ex/types'
import type { RequestDetails } from '../../../../src/runtime'
import { STATE_KEY } from '../../../../src/dashboard/types'
import { loadCache, saveCache } from '../../../../src/dashboard/cache'
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
      },
    ]
    render(h(source.RenderComponent!, { data }), { container })
    expect(within(container).getAllByRole('listitem')).toHaveLength(1)
  })

  test('fetch wires fetcher + state and returns visible topics', async () => {
    const runtime: TestRuntime = {
      ...createRuntime(),
      request: (d: RequestDetails) => {
        if (d.url.includes('hot.json')) {
          d.onload({ responseText: '[]' })
        } else {
          d.onload({ responseText: '[]' })
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
          })
        } else {
          d.onload({ responseText: '[]' })
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
        d.onload({ responseText: '[]' })
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
})
