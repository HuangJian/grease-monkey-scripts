import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createDashboard } from '../../src/dashboard/app'
import { DEFAULT_CONFIG } from '../../src/dashboard/config'
import { getMountedRoot } from '../../src/dashboard/shell/mount'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../runtime'

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.v2ex.com/',
  })
}

function shadowOf(dom: JSDOM, id = 'gm-dashboard'): ShadowRoot {
  const host = dom.window.document.getElementById(id) as HTMLElement
  if (!host) throw new Error('host not mounted')
  const root = getMountedRoot(host)
  if (!root) throw new Error(`no shadow root for #${id}`)
  return root
}

describe('cross-tab broadcast', () => {
  let dom: JSDOM
  let runtime: TestRuntime

  beforeEach(() => {
    dom = makeDom()
    runtime = createRuntime(dom)
  })

  afterEach(() => {
    dom.window.document.body.innerHTML = ''
  })

  test('setValue alone does NOT fire the local listener', () => {
    const fired: unknown[] = []
    runtime.addValueChangeListener('k', (_key, _old, value) => fired.push(value))
    runtime.setValue('k', { a: 1 })
    expect(fired).toEqual([])
  })

  test('simulateRemoteChange fires listener with remote=true and updates store', () => {
    const fired: Array<{ value: unknown; remote: boolean }> = []
    runtime.addValueChangeListener('k', (_key, _old, value, remote) =>
      fired.push({ value, remote }),
    )
    const next = { schemaVersion: CACHE_SCHEMA_VERSION, fetchedAt: 1, byteSize: 0 }
    runtime.simulateRemoteChange('k', next)
    expect(fired).toEqual([{ value: next, remote: true }])
    expect(runtime.stores['k']).toBe(next)
  })

  test('writing tab re-renders the card without relying on listener', async () => {
    runtime.request = ((d) => d.onload({ responseText: '[]' })) as typeof runtime.request
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    const shadow = shadowOf(dom)
    // The dashboard's own listener is registered, but setValue (called inside
    // refreshSource) must not fire it. We assert the card updates *anyway*
    // because refreshSource re-renders explicitly.
    await dashboard.refreshSource('v2ex')
    const v2exPanel = shadow.querySelector(
      '[data-source="browse"] .gm-sp-tab-panel[data-tab-id="v2ex"]',
    ) as HTMLElement
    expect(v2exPanel.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })

  test('remote change from another tab re-renders the open card', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    const topic = {
      id: 1,
      title: 'from-other-tab',
      url: 'https://x/t/1',
      replies: 7,
      member: { username: 'u' },
      node: { title: 'n' },
    }
    const newCache: CachedSource<unknown> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: [topic],
      fetchedAt: Date.now(),
      byteSize: 200,
    }
    runtime.simulateRemoteChange(CACHE_KEY('v2ex'), newCache)
    await new Promise((r) => setTimeout(r, 0))
    const shadow = shadowOf(dom)
    const v2exPanel = shadow.querySelector(
      '[data-source="browse"] .gm-sp-tab-panel[data-tab-id="v2ex"]',
    ) as HTMLElement
    expect(v2exPanel.querySelector('.gm-sp-item-title')!.textContent).toBe('from-other-tab')
  })

  test('remote change to reddit cache re-renders the open card', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    const newCache: CachedSource<unknown> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: {
        popular: [
          {
            id: 'remote1',
            title: 'reddit-remote-update',
            url: 'https://www.reddit.com/r/popular/comments/remote1/x',
            score: 1234,
            numComments: 56,
            subreddits: ['popular'],
            author: 'u',
            created: Date.now(),
          },
        ],
      },
      fetchedAt: Date.now(),
      byteSize: 200,
    }
    runtime.simulateRemoteChange(CACHE_KEY('reddit'), newCache)
    await new Promise((r) => setTimeout(r, 0))
    const shadow = shadowOf(dom)
    const redditPanel = shadow.querySelector(
      '[data-source="browse"] .gm-sp-tab-panel[data-tab-id="reddit"]',
    ) as HTMLElement
    expect(redditPanel.querySelector('.gm-sp-item-title')!.textContent).toBe('reddit-remote-update')
  })

  test('remote change while overlay closed is a no-op (no crash)', () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    expect(() => {
      runtime.simulateRemoteChange(CACHE_KEY('v2ex'), null)
    }).not.toThrow()
  })
})
