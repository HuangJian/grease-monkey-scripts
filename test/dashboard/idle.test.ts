import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createDashboard } from '../../src/dashboard/dashboard'
import { DEFAULT_CONFIG } from '../../src/dashboard/config'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../runtime'

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.v2ex.com/',
  })
}

describe('opportunistic idle refresh', () => {
  let dom: JSDOM
  let runtime: TestRuntime

  beforeEach(() => {
    dom = makeDom()
    runtime = createRuntime(dom)
  })

  afterEach(() => {
    dom.window.document.body.innerHTML = ''
  })

  test('start() schedules an idle callback that refreshes stale sources', async () => {
    let idleCb: (() => void) | null = null
    runtime.requestIdleCallback = (cb) => {
      idleCb = cb
    }
    const oldCache: CachedSource<unknown> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      fetchedAt: Date.now() - 2 * 60 * 60 * 1000, // 2h old
      byteSize: 0,
    }
    runtime.stores[CACHE_KEY('v2ex')] = oldCache
    runtime.request = ((d) => d.onload({ responseText: '[]' })) as typeof runtime.request
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    expect(idleCb).not.toBeNull()
    idleCb!()
    await dashboard.runOpportunisticRefresh()
    const stored = runtime.stores[CACHE_KEY('v2ex')] as CachedSource<unknown>
    expect(stored.fetchedAt).toBeGreaterThan(oldCache.fetchedAt)
  })

  test('idle callback does not refresh fresh sources', async () => {
    let called = 0
    runtime.requestIdleCallback = () => {}
    runtime.request = ((d) => {
      called++
      d.onload({ responseText: '[]' })
    }) as typeof runtime.request
    const freshCache: CachedSource<unknown> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      fetchedAt: Date.now(),
      byteSize: 0,
    }
    runtime.stores[CACHE_KEY('v2ex')] = freshCache
    runtime.stores[CACHE_KEY('weather')] = freshCache
    runtime.stores[CACHE_KEY('novels')] = freshCache
    runtime.stores[CACHE_KEY('reddit')] = freshCache
    runtime.stores[CACHE_KEY('tnews')] = freshCache
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.runOpportunisticRefresh()
    expect(called).toBe(0)
  })

  test('dashboard tolerates a host that does not call requestIdleCallback', () => {
    runtime.requestIdleCallback = () => {}
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    expect(() => dashboard.start()).not.toThrow()
  })
})
