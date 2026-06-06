import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createV2exSource } from '../../../../src/dashboard/v2ex/source'
import type { V2exSourceOptions, V2exTopic } from '../../../../src/dashboard/v2ex/types'
import type { RequestDetails } from '../../../../src/runtime'
import { createRuntime, type TestRuntime } from '../../../runtime'

const DEFAULTS: V2exSourceOptions = {
  ttlMinutes: 30,
  minItems: 10,
  maxItems: 30,
  displayRatio: 0.1,
  elbowDropRatio: 0.4,
  minReplies: 5,
  ageHalfLifeDays: 2,
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.v2ex.com/',
  })
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
    const editor = source.createEditor?.()
    expect(typeof editor).toBe('function')
  })

  test('render does not throw and renders items', () => {
    const dom = makeDom()
    const container = dom.window.document.createElement('div')
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
    source.render(container, data)
    expect(container.querySelectorAll('.gm-sp-v2ex-item')).toHaveLength(1)
  })

  test('fetch wires fetcher + state and returns visible topics', async () => {
    const dom = makeDom()
    const runtime: TestRuntime = {
      ...createRuntime(dom),
      request: (d: RequestDetails) => {
        if (d.url.includes('hot.json')) {
          d.onload({ responseText: '[]' })
        } else {
          d.onload({ responseText: '[]' })
        }
      },
    }
    const source = createV2exSource({ ...DEFAULTS, minItems: 0, maxItems: 0 })
    const result = await source.fetch(runtime, undefined)
    expect(result).toEqual([])
    const stored = runtime.stores['gm:v2ex:topic-state']
    expect(stored).toBeDefined()
  })

  test('fetch drops hidden topics from the result', async () => {
    const dom = makeDom()
    const runtime: TestRuntime = {
      ...createRuntime(dom),
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
    runtime.stores['gm:v2ex:topic-state'] = { '7': { h: Date.now() } }
    const source = createV2exSource({ ...DEFAULTS, minItems: 1, maxItems: 1 })
    const result = await source.fetch(runtime, undefined)
    expect(result).toEqual([])
  })
})
