import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createNovelsEditor } from '../../../src/dashboard/novels/editor'
import { CONFIG_KEY } from '../../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../../runtime'
import type { NovelEntry } from '../../../src/dashboard/novels/types'

function dom(): JSDOM {
  return new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/',
  })
}

let runtime: TestRuntime
let root: HTMLElement
let closed: boolean

beforeEach(() => {
  const d = dom()
  runtime = createRuntime(d)
  root = d.window.document.createElement('div')
  d.window.document.body.appendChild(root)
  closed = false
})

afterEach(() => {
  root.replaceChildren()
})

const baseOptions = {
  ttlMinutes: 60,
  maxNewChaptersPerBook: 5,
  initialNewChapters: 3,
  maxLatestWindow: 50,
}

async function mountEditor(entries: NovelEntry[], cachedTitles: Map<string, string> = new Map()) {
  const editor = createNovelsEditor({
    entries,
    ...baseOptions,
    getCachedTitles: () => Promise.resolve(cachedTitles),
  })
  const result = await editor(root, {
    runtime,
    onRevert: () => {},
    close: () => {
      closed = true
    },
  })
  await new Promise((r) => setTimeout(r, 0))
  return result
}

describe('createNovelsEditor', () => {
  test('renders empty list when no entries', async () => {
    await mountEditor([])
    expect(root.querySelector('.gm-sp-ne-empty')!.textContent).toContain('尚未添加')
  })

  test('renders existing entries with title from cache', async () => {
    await mountEditor(
      [{ url: 'https://www.sudugu.org/166/' }],
      new Map([['https://www.sudugu.org/166/', '九龙夺嫡']]),
    )
    const items = root.querySelectorAll('.gm-sp-ne-item')
    expect(items.length).toBe(1)
    expect(items[0]!.querySelector('.gm-sp-ne-item-label')!.textContent).toBe('九龙夺嫡')
  })

  test('uses alias when no cached title', async () => {
    await mountEditor([{ url: 'https://www.sudugu.org/166/', alias: '神书' }])
    expect(root.querySelector('.gm-sp-ne-item-label')!.textContent).toBe('神书')
  })

  test('shows unknown-site warning for unregistered hostnames', async () => {
    await mountEditor([{ url: 'https://other.example/x/' }])
    const warn = root.querySelector('.gm-sp-ne-item-warn') as HTMLElement
    expect(warn.hidden).toBe(false)
    expect(warn.textContent).toContain('未知站点')
  })

  test('hides unknown-site warning for registered hostnames', async () => {
    await mountEditor([{ url: 'https://www.sudugu.org/166/' }])
    const warn = root.querySelector('.gm-sp-ne-item-warn') as HTMLElement
    expect(warn.hidden).toBe(true)
  })

  test('adds a valid URL to the list', async () => {
    await mountEditor([])
    const urlInput = root.querySelector('.gm-sp-ne-url') as HTMLInputElement
    const aliasInput = root.querySelector('.gm-sp-ne-alias') as HTMLInputElement
    const addBtn = root.querySelector('.gm-sp-ne-add') as HTMLButtonElement
    urlInput.value = 'https://www.sudugu.org/12/'
    aliasInput.value = '龙藏'
    addBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(root.querySelectorAll('.gm-sp-ne-item').length).toBe(1)
    expect(root.querySelector('.gm-sp-ne-item-label')!.textContent).toBe('龙藏')
  })

  test('rejects empty URL', async () => {
    await mountEditor([])
    ;(root.querySelector('.gm-sp-ne-add') as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    const err = root.querySelector('.gm-sp-ne-error') as HTMLElement
    expect(err.hidden).toBe(false)
    expect(err.textContent).toContain('URL')
  })

  test('rejects duplicate URL', async () => {
    await mountEditor([{ url: 'https://www.sudugu.org/166/' }])
    const urlInput = root.querySelector('.gm-sp-ne-url') as HTMLInputElement
    const addBtn = root.querySelector('.gm-sp-ne-add') as HTMLButtonElement
    urlInput.value = 'https://www.sudugu.org/166/'
    addBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    const err = root.querySelector('.gm-sp-ne-error') as HTMLElement
    expect(err.textContent).toContain('已在列表中')
  })

  test('rejects invalid URL', async () => {
    await mountEditor([])
    const urlInput = root.querySelector('.gm-sp-ne-url') as HTMLInputElement
    const addBtn = root.querySelector('.gm-sp-ne-add') as HTMLButtonElement
    urlInput.value = 'not-a-url'
    addBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    const err = root.querySelector('.gm-sp-ne-error') as HTMLElement
    expect(err.textContent).toContain('无效')
  })

  test('removes an entry when the × button is clicked', async () => {
    await mountEditor([
      { url: 'https://www.sudugu.org/166/' },
      { url: 'https://www.sudugu.org/12/' },
    ])
    expect(root.querySelectorAll('.gm-sp-ne-item').length).toBe(2)
    const removeBtns = root.querySelectorAll<HTMLButtonElement>('.gm-sp-ne-remove')
    removeBtns[0]!.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(root.querySelectorAll('.gm-sp-ne-item').length).toBe(1)
    expect(root.querySelector('.gm-sp-ne-item-url')!.textContent).toContain('12/')
  })

  test('cancel button triggers close', async () => {
    const result = await mountEditor([])
    result.cancel?.()
    expect(closed).toBe(true)
  })

  test('save persists novels config to CONFIG_KEY', async () => {
    const result = await mountEditor([{ url: 'https://www.sudugu.org/166/' }])
    void result.save?.()
    await new Promise((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as
      | { novels: { entries: NovelEntry[]; ttlMinutes: number } }
      | undefined
    expect(stored).toBeTruthy()
    expect(stored?.novels.entries).toEqual([{ url: 'https://www.sudugu.org/166/' }])
    expect(stored?.novels.ttlMinutes).toBe(60)
  })

  test('save rejects invalid TTL', async () => {
    const result = await mountEditor([])
    const ttl = root.querySelector('.gm-sp-ne-ttl') as HTMLInputElement
    ttl.value = '0'
    void result.save?.()
    await new Promise((r) => setTimeout(r, 0))
    const err = root.querySelector('.gm-sp-ne-error') as HTMLElement
    expect(err.textContent).toContain('TTL')
  })

  test('allows saving an entry with unknown host', async () => {
    const result = await mountEditor([{ url: 'https://other.example/x/' }])
    void result.save?.()
    await new Promise((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as { novels: { entries: NovelEntry[] } } | undefined
    expect(stored?.novels.entries).toEqual([{ url: 'https://other.example/x/' }])
  })

  test('save merges with existing weather config instead of overwriting it', async () => {
    const preexisting = {
      weather: {
        cities: [{ latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' }],
        ttlMinutes: 30,
      },
    }
    runtime.stores[CONFIG_KEY] = preexisting
    const result = await mountEditor([{ url: 'https://www.sudugu.org/166/' }])
    void result.save?.()
    await new Promise((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as Record<string, unknown> | undefined
    expect(stored?.weather).toEqual(preexisting.weather)
    expect(stored?.novels).toBeTruthy()
    if (stored) {
      expect((stored.novels as { entries: NovelEntry[] }).entries).toEqual([
        { url: 'https://www.sudugu.org/166/' },
      ])
    }
  })
})
