import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, within } from '@testing-library/preact'
import { createNovelsEditor } from '../../../src/prism/novels/editor/form'
import { CONFIG_KEY, DEFAULT_SOURCE_SETTINGS } from '../../../src/prism/types'
import { createRuntime, type TestRuntime } from '../../runtime'
import type { NovelEntry } from '../../../src/prism/novels/types'

let runtime: TestRuntime
let root: HTMLElement
let closed: boolean

beforeEach(() => {
  globalThis.location.href = 'https://example.com/'
  runtime = createRuntime()
  root = document.createElement('div')
  document.body.appendChild(root)
  closed = false
})

afterEach(() => {
  cleanup()
  root.replaceChildren()
})

const baseOptions = {
  ttlMinutes: 60,
  maxNewChaptersPerBook: 5,
  initialNewChapters: 3,
  maxLatestWindow: 50,
}

async function mountEditor(entries: NovelEntry[], cachedTitles: Map<string, string> = new Map()) {
  const editor = createNovelsEditor(
    {
      entries,
      ...baseOptions,
      getCachedTitles: () => Promise.resolve(cachedTitles),
    },
    DEFAULT_SOURCE_SETTINGS,
  )
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
    expect(within(root).getByText(/尚未添加/)).not.toBeNull()
  })

  test('renders existing entries with title from cache', async () => {
    await mountEditor(
      [{ url: 'https://www.sudugu.org/166/' }],
      new Map([['https://www.sudugu.org/166/', '九龙夺嫡']]),
    )
    const items = within(root).queryAllByText('九龙夺嫡')
    expect(items.length).toBe(1)
    expect(items[0]!.textContent).toBe('九龙夺嫡')
  })

  test('uses alias when no cached title', async () => {
    await mountEditor([{ url: 'https://www.sudugu.org/166/', alias: '神书' }])
    expect(within(root).getByText('神书')).not.toBeNull()
  })

  test('shows unknown-site warning for unregistered hostnames', async () => {
    await mountEditor([{ url: 'https://other.example/x/' }])
    const warn = within(root).getByText('未知站点') as HTMLElement
    expect(warn.hidden).toBe(false)
  })

  test('hides unknown-site warning for registered hostnames', async () => {
    await mountEditor([{ url: 'https://www.sudugu.org/166/' }])
    const warn = within(root).getByText('未知站点') as HTMLElement
    expect(warn.hidden).toBe(true)
  })

  test('adds a valid URL to the list', async () => {
    await mountEditor([])
    const urlInput = within(root).getByPlaceholderText(
      'https://www.sudugu.org/166/',
    ) as HTMLInputElement
    const aliasInput = within(root).getByPlaceholderText('九龙夺嫡') as HTMLInputElement
    const addBtn = within(root).getByRole('button', { name: '添加书库' }) as HTMLButtonElement
    urlInput.value = 'https://www.sudugu.org/12/'
    aliasInput.value = '龙藏'
    addBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root).queryAllByText('龙藏').length).toBe(1)
    expect(within(root).getByText('龙藏').textContent).toBe('龙藏')
  })

  test('rejects empty URL', async () => {
    await mountEditor([])
    ;(within(root).getByRole('button', { name: '添加书库' }) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root).getByText('请输入书库 URL')).not.toBeNull()
  })

  test('rejects duplicate URL', async () => {
    await mountEditor([{ url: 'https://www.sudugu.org/166/' }])
    const urlInput = within(root).getByPlaceholderText(
      'https://www.sudugu.org/166/',
    ) as HTMLInputElement
    const addBtn = within(root).getByRole('button', { name: '添加书库' }) as HTMLButtonElement
    urlInput.value = 'https://www.sudugu.org/166/'
    addBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root).getByText(/已在列表中/)).not.toBeNull()
  })

  test('rejects invalid URL', async () => {
    await mountEditor([])
    const urlInput = within(root).getByPlaceholderText(
      'https://www.sudugu.org/166/',
    ) as HTMLInputElement
    const addBtn = within(root).getByRole('button', { name: '添加书库' }) as HTMLButtonElement
    urlInput.value = 'not-a-url'
    addBtn.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root).getByText(/无效/)).not.toBeNull()
  })

  test('removes an entry when the × button is clicked', async () => {
    await mountEditor([
      { url: 'https://www.sudugu.org/166/' },
      { url: 'https://www.sudugu.org/12/' },
    ])
    expect(within(root).getAllByRole('button', { name: 'remove' }).length).toBe(2)
    const removeBtns = within(root).getAllByRole('button', { name: 'remove' })
    removeBtns[0]!.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root).getAllByRole('button', { name: 'remove' }).length).toBe(1)
    expect(within(root).getAllByText('https://www.sudugu.org/12/').length).toBeGreaterThanOrEqual(1)
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
    const advanced = root.querySelector('.gm-sp-editor-advanced') as HTMLElement
    const inputs = within(advanced).queryAllByRole('spinbutton')
    ;(inputs[0] as HTMLInputElement).value = '0'
    void result.save?.()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root).getByText('TTL 必须是 ≥1 的整数')).not.toBeNull()
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
