import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, within } from '@testing-library/preact'
import { DEFAULT_CONFIG } from '../../../../src/dashboard/config'
import { createTnewsEditor } from '../../../../src/dashboard/tnews/editor'
import type { TnewsSourceOptions } from '../../../../src/dashboard/tnews/types'
import { DEFAULT_SOURCE_SETTINGS } from '../../../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

afterEach(cleanup)

const DEFAULT_OPTS: TnewsSourceOptions = {
  feeds: ['https://rsshub.app/telegram/channel/tnews365'],
  mirrors: [],
  ttlMinutes: 30,
}

async function setup(
  runtime: TestRuntime = createRuntime(),
  options: TnewsSourceOptions = DEFAULT_OPTS,
) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  const close = () => root.replaceChildren()
  const editor = createTnewsEditor(options, DEFAULT_SOURCE_SETTINGS)
  const result = await editor(root, { runtime, onRevert: () => {}, close })
  return { runtime, root, close, result }
}

describe('createTnewsEditor', () => {
  test('renders feed and mirror chip lists, ttl input', async () => {
    const { root } = await setup()
    expect(within(root).getByText('Feed URL 列表')).not.toBeNull()
    expect(within(root).getByText('RSSHub 镜像 hostname')).not.toBeNull()
    expect((within(root).getByLabelText('TTL（分钟）') as HTMLInputElement).value).toBe('30')
  })

  test('prefills default mirrors from DEFAULT_CONFIG on first open', async () => {
    const { root } = await setup(createRuntime(), DEFAULT_CONFIG.tnews)
    expect(within(root).getByText('rsshub.rssforever.com')).not.toBeNull()
  })

  test('rejects invalid feed URL on add', async () => {
    const { root } = await setup()
    const feedSection = within(root)
      .getByText('Feed URL 列表')
      .closest('.gm-sp-editor-section')! as HTMLElement
    const input = within(feedSection).getByPlaceholderText(/rsshub\.app/) as HTMLInputElement
    const addBtn = within(feedSection).getByRole('button', { name: '添加' }) as HTMLButtonElement
    input.value = 'not a url'
    addBtn.click()
    expect(within(root).getByText('feed URL 必须以 http:// 或 https:// 开头')).not.toBeNull()
  })

  test('rejects invalid mirror hostname on add', async () => {
    const { root } = await setup()
    const mirrorSection = within(root)
      .getByText('RSSHub 镜像 hostname')
      .closest('.gm-sp-editor-section')! as HTMLElement
    const input = within(mirrorSection).getByPlaceholderText(
      'rsshub.example.com',
    ) as HTMLInputElement
    const addBtn = within(mirrorSection).getByRole('button', { name: '添加' }) as HTMLButtonElement
    input.value = 'bad host!'
    addBtn.click()
    expect(within(root).getByText(/字母、数字、点和中横线/)).not.toBeNull()
  })

  test('rejects empty feeds on save', async () => {
    const { root, result } = await setup()
    const removeButtons = within(root).getAllByRole('button', { name: 'remove' })
    removeButtons.forEach((b) => b.click())
    void result.save?.()
    expect(within(root).getByText('至少添加一个 feed URL')).not.toBeNull()
  })

  test('rejects ttlMinutes <= 0 on save', async () => {
    const { root, result } = await setup()
    const ttl = within(root).getByLabelText('TTL（分钟）') as HTMLInputElement
    ttl.value = '0'
    void result.save?.()
    expect(within(root).getByText('TTL 必须是 ≥1 的整数')).not.toBeNull()
  })

  test('saves valid section to CONFIG_KEY and closes', async () => {
    const { runtime, root, result } = await setup()
    const feedSection = within(root)
      .getByText('Feed URL 列表')
      .closest('.gm-sp-editor-section')! as HTMLElement
    const input = within(feedSection).getByPlaceholderText(/rsshub\.app/) as HTMLInputElement
    const addBtn = within(feedSection).getByRole('button', { name: '添加' }) as HTMLButtonElement
    input.value = 'https://example.com/feed'
    addBtn.click()
    void result.save?.()
    await new Promise((r) => setTimeout(r, 100))
    const cfg = runtime.stores['dashboard:v2:config'] as { tnews: typeof DEFAULT_OPTS } | undefined
    expect(cfg?.tnews.feeds).toContain('https://example.com/feed')
  })

  test('rejects duplicate feed URL', async () => {
    const { root } = await setup()
    const feedSection = within(root)
      .getByText('Feed URL 列表')
      .closest('.gm-sp-editor-section')! as HTMLElement
    const input = within(feedSection).getByPlaceholderText(/rsshub\.app/) as HTMLInputElement
    const addBtn = within(feedSection).getByRole('button', { name: '添加' }) as HTMLButtonElement
    input.value = 'https://rsshub.app/telegram/channel/tnews365'
    addBtn.click()
    expect(within(root).getByText('该 URL 已在列表中')).not.toBeNull()
  })

  test('loads existing feeds from CONFIG_KEY on open', async () => {
    const runtime = createRuntime()
    runtime.stores['dashboard:v2:config'] = {
      tnews: {
        feeds: ['https://custom.example/feed'],
        mirrors: ['custom.mirror.example'],
        ttlMinutes: 45,
      },
    }
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    const editor = createTnewsEditor(DEFAULT_OPTS, DEFAULT_SOURCE_SETTINGS)
    await editor(root, { runtime, onRevert: () => {}, close: () => {} })
    expect((within(root).getByLabelText('TTL（分钟）') as HTMLInputElement).value).toBe('45')
    expect(within(root).getByText('https://custom.example/feed')).not.toBeNull()
    expect(within(root).getByText('custom.mirror.example')).not.toBeNull()
  })

  test('cancel button closes without saving', async () => {
    const { runtime, result } = await setup()
    const initialConfig = runtime.stores['dashboard:v2:config']
    result.cancel?.()
    expect(runtime.stores['dashboard:v2:config']).toBe(initialConfig)
  })
})
