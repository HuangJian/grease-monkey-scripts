import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, waitFor, within } from '@testing-library/preact'
import { createRssEditor } from '../../../src/prism/rss/editor/form'
import { DEFAULT_SOURCE_SETTINGS } from '../../../src/prism/types'
import type { RssSourceOptions } from '../../../src/prism/rss/types'
import { createRuntime, type TestRuntime } from '../../runtime'

afterEach(cleanup)

const DEFAULT_OPTS: RssSourceOptions = {
  feeds: [],
  ttlMinutes: 123,
  retentionDays: 30,
  maxItemsPerFeed: 100,
  viewMode: 'grouped',
}

function configOf(runtime: TestRuntime): { rss?: RssSourceOptions } | undefined {
  return runtime.stores['dashboard:v2:config'] as { rss?: RssSourceOptions } | undefined
}

async function setup(
  runtime: TestRuntime = createRuntime(),
  options: RssSourceOptions = DEFAULT_OPTS,
) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  const editor = createRssEditor(options, DEFAULT_SOURCE_SETTINGS)
  const result = await editor(root, { runtime, onRevert: () => {}, close: () => {} })
  return { runtime, root, result }
}

function setInput(el: Element, value: string): void {
  const input = el as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function addFeed(root: HTMLElement, url: string, title = ''): void {
  const urlInput = within(root).getByLabelText('订阅源 URL')
  if (title) setInput(within(root).getByLabelText('标题（可选）'), title)
  setInput(urlInput, url)
  root.querySelector<HTMLButtonElement>('[data-action="add-feed"]')!.click()
}

describe('createRssEditor', () => {
  test('renders the empty state and the default advanced values', async () => {
    const { root } = await setup()
    expect(within(root).getByText('尚未添加订阅源')).not.toBeNull()
    expect((within(root).getByLabelText('刷新间隔（分钟）') as HTMLInputElement).value).toBe('123')
    expect((within(root).getByLabelText('保留天数（天）') as HTMLInputElement).value).toBe('30')
    expect((within(root).getByLabelText('每源条数') as HTMLInputElement).value).toBe('100')
  })

  test('adds a feed and shows its url', async () => {
    const { root } = await setup()
    addFeed(root, 'https://example.com/feed.xml', 'Example')
    expect(within(root).queryByText('尚未添加订阅源')).toBeNull()
    expect(within(root).getByTitle('https://example.com/feed.xml')).not.toBeNull()
  })

  test('rejects an invalid URL', async () => {
    const { root } = await setup()
    addFeed(root, 'not-a-url')
    expect(within(root).getByText('URL 格式无效')).not.toBeNull()
    expect(within(root).getByText('尚未添加订阅源')).not.toBeNull()
  })

  test('rejects an empty URL', async () => {
    const { root } = await setup()
    addFeed(root, '')
    expect(within(root).getByText('请输入订阅源 URL')).not.toBeNull()
  })

  test('rejects a duplicate URL', async () => {
    const { root } = await setup()
    addFeed(root, 'https://example.com/feed.xml')
    addFeed(root, 'https://example.com/feed.xml')
    expect(within(root).getByText('该订阅源已在列表中')).not.toBeNull()
    expect(root.querySelectorAll('.gm-sp-re-feed')).toHaveLength(1)
  })

  test('removes a feed', async () => {
    const { root } = await setup()
    addFeed(root, 'https://example.com/a.xml')
    addFeed(root, 'https://example.com/b.xml')
    expect(root.querySelectorAll('.gm-sp-re-feed')).toHaveLength(2)
    root
      .querySelectorAll<HTMLButtonElement>('.gm-sp-re-feed [aria-label="remove feed"]')[0]!
      .click()
    expect(root.querySelectorAll('.gm-sp-re-feed')).toHaveLength(1)
    expect(within(root).getByTitle('https://example.com/b.xml')).not.toBeNull()
  })

  test('saves feeds and advanced fields to CONFIG_KEY', async () => {
    const { runtime, root, result } = await setup()
    addFeed(root, 'https://example.com/feed.xml', 'Example')
    setInput(within(root).getByLabelText('刷新间隔（分钟）'), '60')
    void result.save?.()
    await waitFor(() => {
      const rss = configOf(runtime)?.rss
      expect(rss?.feeds).toEqual([{ url: 'https://example.com/feed.xml', title: 'Example' }])
      expect(rss?.ttlMinutes).toBe(60)
    })
  })

  test('saves the selected view mode', async () => {
    const { runtime, root, result } = await setup()
    const select = root.querySelector<HTMLSelectElement>('[data-action="view-mode"]')!
    select.value = 'timeline'
    select.dispatchEvent(new Event('change'))
    void result.save?.()
    await waitFor(() => {
      expect(configOf(runtime)?.rss?.viewMode).toBe('timeline')
    })
  })

  test('rejects ttlMinutes <= 0 on save', async () => {
    const { runtime, root, result } = await setup()
    setInput(within(root).getByLabelText('刷新间隔（分钟）'), '0')
    void result.save?.()
    expect(within(root).getByText('刷新间隔必须是 ≥1 的整数')).not.toBeNull()
    expect(configOf(runtime)).toBeUndefined()
  })

  test('loads existing feeds from CONFIG_KEY on open', async () => {
    const runtime = createRuntime()
    runtime.stores['dashboard:v2:config'] = {
      rss: {
        feeds: [{ url: 'https://example.com/saved.xml', title: 'Saved' }],
        ttlMinutes: 45,
        retentionDays: 30,
        maxItemsPerFeed: 100,
        viewMode: 'timeline',
      },
    }
    const { root } = await setup(runtime, { ...DEFAULT_OPTS, feeds: [] })
    expect(within(root).getByTitle('https://example.com/saved.xml')).not.toBeNull()
    expect((within(root).getByLabelText('刷新间隔（分钟）') as HTMLInputElement).value).toBe('45')
    expect(root.querySelector<HTMLSelectElement>('[data-action="view-mode"]')!.value).toBe(
      'timeline',
    )
  })

  test('export button downloads an .opml file containing the current feeds', async () => {
    const { root } = await setup()
    addFeed(root, 'https://example.com/a.xml', 'A 站')

    const anchors: HTMLAnchorElement[] = []
    const origCreateElement = document.createElement.bind(document)
    const origCreateObjectURL = URL.createObjectURL
    // Wrapped in an object: a bare `let` would be narrowed to `null` at the
    // assertion point because TS cannot see the assignment inside the stub.
    const captured: { blob: Blob | null } = { blob: null }
    document.createElement = ((tag: string, ...rest: unknown[]) => {
      const el = origCreateElement(tag, ...(rest as []))
      if (tag === 'a') anchors.push(el as HTMLAnchorElement)
      return el
    }) as typeof document.createElement
    URL.createObjectURL = ((blob: Blob) => {
      captured.blob = blob
      return 'blob:stub'
    }) as typeof URL.createObjectURL
    try {
      root.querySelector<HTMLButtonElement>('[data-action="export-opml"]')!.click()
    } finally {
      document.createElement = origCreateElement
      URL.createObjectURL = origCreateObjectURL
    }
    expect(anchors[0]?.download).toBe('gm-rss-subscriptions.opml')
    expect(captured.blob?.type).toBe('text/x-opml')
    expect(await captured.blob!.text()).toContain('xmlUrl="https://example.com/a.xml"')
  })

  test('import merges new feeds and reports added/skipped counts', async () => {
    const { root } = await setup()
    addFeed(root, 'https://example.com/a.xml')
    const xml = `<opml version="2.0"><body>
      <outline text="A 站" xmlUrl="https://example.com/a.xml"/>
      <outline text="B 站" xmlUrl="https://example.com/b.xml"/>
    </body></opml>`
    const input = root.querySelector<HTMLInputElement>('[data-action="import-opml"]')!
    Object.defineProperty(input, 'files', {
      value: [new File([xml], 'subs.opml', { type: 'text/x-opml' })],
      configurable: true,
    })
    input.dispatchEvent(new Event('change'))
    await waitFor(() => {
      expect(within(root).getByText('导入完成：新增 1 个，跳过 1 个')).not.toBeNull()
    })
    expect(root.querySelectorAll('.gm-sp-re-feed')).toHaveLength(2)
    expect(within(root).getByTitle('https://example.com/b.xml')).not.toBeNull()
  })

  test('cancel does not write config', async () => {
    const { runtime, result } = await setup()
    result.cancel?.()
    expect(configOf(runtime)).toBeUndefined()
  })
})
