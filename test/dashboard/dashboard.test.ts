import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createDashboard, isHostAllowed } from '../../src/dashboard/dashboard'
import { DEFAULT_CONFIG, validateConfig } from '../../src/dashboard/config'
import { getMountedRoot } from '../../src/dashboard/overlay/mount'
import { CACHE_KEY, CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../runtime'

function shadowOf(dom: JSDOM, id = 'gm-dashboard'): ShadowRoot {
  const host = dom.window.document.getElementById(id) as HTMLElement
  const root = host.shadowRoot ?? getMountedRoot(host)
  if (!root) throw new Error(`no shadow root for #${id}`)
  return root
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://www.v2ex.com/',
  })
}

describe('createDashboard', () => {
  let dom: JSDOM
  let runtime: TestRuntime

  beforeEach(() => {
    dom = makeDom()
    runtime = createRuntime(dom)
  })

  afterEach(() => {
    dom.window.document.documentElement.innerHTML = ''
  })

  test('start() registers two menu commands', () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    expect(runtime.menuCommands.map((c) => c.name)).toEqual(['打开仪表盘', '编辑仪表盘配置'])
  })

  test('open() mounts shadow root with header and cards', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    const host = dom.window.document.getElementById('gm-dashboard')
    expect(host).not.toBeNull()
    expect(host!.shadowRoot).toBeNull()
    const shadow = shadowOf(dom)
    expect(shadow.querySelector('.gm-sp-header')).not.toBeNull()
    const cards = shadow.querySelectorAll('.gm-sp-card')
    expect(cards.length).toBe(2)
  })

  test('open() renders cached data into cards', async () => {
    const v2exCache: CachedSource<unknown> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: [
        {
          id: 1,
          title: 'cached',
          url: 'https://x/t/1',
          replies: 5,
          member: { username: 'u' },
          node: { title: 'n' },
        },
      ],
      fetchedAt: Date.now() - 60_000,
      byteSize: 100,
    }
    runtime.stores[CACHE_KEY('v2ex')] = v2exCache
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    const shadow = shadowOf(dom)
    const v2exCard = shadow.querySelector('[data-source="v2ex"]') as HTMLElement
    expect(v2exCard.querySelector('.gm-sp-v2ex-title')!.textContent).toBe('cached')
  })

  test('close() removes the host element', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    dashboard.close()
    expect(dom.window.document.getElementById('gm-dashboard')).toBeNull()
  })

  test('clicking backdrop closes the overlay', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    const shadow = shadowOf(dom)
    const backdrop = shadow.querySelector('.gm-sp-backdrop')!
    backdrop.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    expect(dom.window.document.getElementById('gm-dashboard')).toBeNull()
  })

  test('remote change listener re-renders the matching card', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    const topic = {
      id: 9,
      title: 'live-update',
      url: 'https://x/t/9',
      replies: 1,
      member: { username: 'live' },
      node: { title: 'live' },
    }
    const newCache: CachedSource<unknown> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: [topic],
      fetchedAt: Date.now(),
      byteSize: 100,
    }
    runtime.simulateRemoteChange(CACHE_KEY('v2ex'), newCache)
    const shadow = shadowOf(dom)
    const v2exCard = shadow.querySelector('[data-source="v2ex"]') as HTMLElement
    expect(v2exCard.querySelector('.gm-sp-v2ex-title')!.textContent).toBe('live-update')
  })

  test('refreshSource acquires lock, fetches, persists cache', async () => {
    let reqUrl = ''
    let reqAnonymous: boolean | undefined
    runtime.request = ((d) => {
      reqUrl = d.url
      reqAnonymous = d.anonymous
      d.onload({ responseText: '[]' })
    }) as typeof runtime.request
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.refreshSource('v2ex')
    expect(reqUrl).toContain('hot.json')
    expect(reqAnonymous).toBe(true)
    const stored = runtime.stores[CACHE_KEY('v2ex')] as CachedSource<unknown>
    expect(stored.schemaVersion).toBe(CACHE_SCHEMA_VERSION)
    expect(stored.fetchedAt).toBeGreaterThan(0)
    expect(stored.data).toEqual([])
  })

  test('refreshSource records error and keeps prior fetchedAt on failure', async () => {
    const oldTopic = {
      id: 1,
      title: 'old',
      url: 'x',
      replies: 0,
      member: { username: 'u' },
      node: { title: 'n' },
    }
    const oldCache: CachedSource<unknown> = {
      schemaVersion: CACHE_SCHEMA_VERSION,
      data: [oldTopic],
      fetchedAt: 1000,
      byteSize: 100,
    }
    runtime.stores[CACHE_KEY('v2ex')] = oldCache
    runtime.request = ((d) => d.onerror?.()) as typeof runtime.request
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.refreshSource('v2ex')
    const stored = runtime.stores[CACHE_KEY('v2ex')] as CachedSource<unknown>
    expect(stored.error).toBe('network error')
    expect(stored.fetchedAt).toBe(1000)
    expect((stored.data as { title: string }[])[0].title).toBe('old')
  })

  test('refreshSource re-renders the open card after writing (no listener needed)', async () => {
    runtime.request = ((d) => d.onload({ responseText: '[]' })) as typeof runtime.request
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    await dashboard.refreshSource('v2ex')
    const shadow = shadowOf(dom)
    const v2exCard = shadow.querySelector('[data-source="v2ex"]') as HTMLElement
    expect(v2exCard.querySelector('.gm-sp-empty')!.textContent).toBe('暂无数据')
  })

  test('refreshSource skips fetch when lock is held', async () => {
    let called = 0
    runtime.request = ((d) => {
      called++
      d.onload({ responseText: '[]' })
    }) as typeof runtime.request
    runtime.stores['dashboard:v1:lock:v2ex'] = { owner: 'other', expiresAt: Date.now() + 60_000 }
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.refreshSource('v2ex')
    expect(called).toBe(0)
  })

  test('double-Shift toggles the overlay', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    const dispatchShift = () => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Shift', bubbles: true }),
      )
    }
    dispatchShift()
    dispatchShift()
    expect(dom.window.document.getElementById('gm-dashboard')).not.toBeNull()
    dispatchShift()
    dispatchShift()
    expect(dom.window.document.getElementById('gm-dashboard')).toBeNull()
  })

  test('Esc closes the overlay', async () => {
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    await dashboard.open()
    dom.window.document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(dom.window.document.getElementById('gm-dashboard')).toBeNull()
  })

  test('editConfig merges and persists user override', () => {
    const prompts: string[] = []
    runtime.prompt = (msg?: string) => {
      prompts.push(msg ?? '')
      if (msg?.includes('配置 JSON 解析失败')) return null
      if (msg?.includes('配置校验失败')) return null
      if (msg === '配置已保存，刷新页面后生效。') return null
      return JSON.stringify({ weather: { cityLabel: '上海' } })
    }
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    dashboard.editConfig()
    const stored = runtime.stores['dashboard:v1:config'] as {
      weather: { cityLabel: string; latitude: number }
    }
    expect(stored.weather.cityLabel).toBe('上海')
    expect(stored.weather.latitude).toBe(DEFAULT_CONFIG.weather.latitude)
  })

  test('editConfig reports parse error without overwriting config', () => {
    const messages: string[] = []
    runtime.prompt = (msg?: string) => {
      messages.push(msg ?? '')
      if (messages.length === 1) return 'not-json{'
      return null
    }
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    dashboard.editConfig()
    expect(messages.some((m) => m.includes('解析失败'))).toBe(true)
    expect(runtime.stores['dashboard:v1:config']).toBeUndefined()
  })

  test('editConfig reports validation error without overwriting config', () => {
    const messages: string[] = []
    runtime.prompt = (msg?: string) => {
      messages.push(msg ?? '')
      if (messages.length === 1) return JSON.stringify({ shortcut: { enabled: 'yes' } })
      return null
    }
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    dashboard.editConfig()
    expect(messages.some((m) => m.includes('配置校验失败'))).toBe(true)
    expect(runtime.stores['dashboard:v1:config']).toBeUndefined()
  })

  test('editConfig catches prompt exception and falls back to alert', () => {
    const messages: string[] = []
    runtime.prompt = ((msg?: string) => {
      if (msg?.startsWith('粘贴 JSON')) throw new Error('blocked by site')
      messages.push(msg ?? '')
      return null
    }) as typeof runtime.prompt
    const dashboard = createDashboard(runtime, { config: DEFAULT_CONFIG })
    dashboard.start()
    dashboard.editConfig()
    expect(messages.some((m) => m.includes('禁用了 prompt'))).toBe(true)
    expect(runtime.stores['dashboard:v1:config']).toBeUndefined()
  })
})

describe('isHostAllowed', () => {
  test('matches exact hostname', () => {
    expect(isHostAllowed(DEFAULT_CONFIG, 'v2ex.com')).toBe(true)
    expect(isHostAllowed(DEFAULT_CONFIG, 'github.com')).toBe(true)
  })
  test('matches subdomains', () => {
    expect(isHostAllowed(DEFAULT_CONFIG, 'www.v2ex.com')).toBe(true)
    expect(isHostAllowed(DEFAULT_CONFIG, 'mail.google.com')).toBe(true)
  })
  test('rejects non-listed hosts', () => {
    expect(isHostAllowed(DEFAULT_CONFIG, 'example.com')).toBe(false)
  })
  test('empty allowlist allows all', () => {
    const cfg = { ...DEFAULT_CONFIG, hostAllowlist: [] }
    expect(isHostAllowed(cfg, 'anywhere.test')).toBe(true)
  })
})

describe('validateConfig', () => {
  test('accepts default config', () => {
    expect(validateConfig(DEFAULT_CONFIG)).toEqual({ ok: true })
  })
  test('rejects non-object root', () => {
    expect(validateConfig(null)).toEqual({ ok: false, error: expect.any(String) })
    expect(validateConfig('x')).toEqual({ ok: false, error: expect.any(String) })
  })
  test('rejects bad shortcut.enabled type', () => {
    const v = validateConfig({ shortcut: { enabled: 'yes' } })
    expect(v.ok).toBe(false)
  })
  test('rejects bad hostAllowlist type', () => {
    const v = validateConfig({ hostAllowlist: 'v2ex.com' })
    expect(v.ok).toBe(false)
  })
  test('rejects bad nested weather type', () => {
    const v = validateConfig({ weather: 'no' })
    expect(v.ok).toBe(false)
  })
})
