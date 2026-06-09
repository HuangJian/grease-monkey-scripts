import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { DEFAULT_CONFIG } from '../../../../src/dashboard/config'
import { createTnewsEditor } from '../../../../src/dashboard/tnews/editor'
import type { TnewsSourceOptions } from '../../../../src/dashboard/tnews/types'
import { createRuntime, type TestRuntime } from '../../../runtime'

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>')
}

function makeRuntime(dom: JSDOM): TestRuntime {
  return createRuntime(dom)
}

function getRoot(dom: JSDOM): HTMLDivElement {
  return dom.window.document.getElementById('root') as HTMLDivElement
}

const DEFAULT_OPTS: TnewsSourceOptions = {
  feeds: ['https://rsshub.app/telegram/channel/tnews365'],
  mirrors: [],
  ttlMinutes: 30,
}

async function setup(
  dom: JSDOM = makeDom(),
  runtime: TestRuntime = makeRuntime(dom),
  options: TnewsSourceOptions = DEFAULT_OPTS,
) {
  const root = getRoot(dom)
  const close = () => root.replaceChildren()
  const editor = createTnewsEditor(options)
  await editor(root, { runtime, onRevert: () => {}, close })
  return { dom, runtime, root, close }
}

describe('createTnewsEditor', () => {
  test('renders feed and mirror chip lists, ttl input', async () => {
    const { root } = await setup()
    expect(root.querySelector('.gm-sp-tne-feeds')).not.toBeNull()
    expect(root.querySelector('.gm-sp-tne-mirrors')).not.toBeNull()
    expect(root.querySelector<HTMLInputElement>('.gm-sp-tne-ttl')!.value).toBe('30')
  })

  test('prefills default mirrors from DEFAULT_CONFIG on first open', async () => {
    const { root } = await setup(makeDom(), makeRuntime(makeDom()), DEFAULT_CONFIG.tnews)
    const labels = Array.from(
      root.querySelectorAll<HTMLElement>('.gm-sp-tne-mirrors .gm-sp-tne-chip-label'),
    ).map((c) => c.textContent)
    expect(labels).toEqual(['rsshub.rssforever.com'])
  })

  test('rejects invalid feed URL on add', async () => {
    const { root } = await setup()
    const input = root.querySelector<HTMLInputElement>('.gm-sp-editor-input')!
    const addBtn = root.querySelector<HTMLButtonElement>('.gm-sp-tne-feed-add')!
    input.value = 'not a url'
    addBtn.click()
    const err = root.querySelector<HTMLElement>('.gm-sp-editor-error')!
    expect(err.hidden).toBe(false)
    expect(err.textContent).toContain('http://')
  })

  test('rejects invalid mirror hostname on add', async () => {
    const { root } = await setup()
    const input = root.querySelector<HTMLInputElement>('.gm-sp-editor-input')!
    const addBtn = root.querySelector<HTMLButtonElement>('.gm-sp-tne-mirror-add')!
    input.value = 'bad host!'
    addBtn.click()
    expect(root.querySelector<HTMLElement>('.gm-sp-editor-error')!.hidden).toBe(false)
  })

  test('rejects empty feeds on save', async () => {
    const { root } = await setup()
    const removeButtons = Array.from(
      root.querySelectorAll<HTMLElement>('.gm-sp-editor-chip-remove'),
    )
    removeButtons.forEach((b) => b.click())
    root.querySelector<HTMLButtonElement>('.gm-sp-tne-save')!.click()
    const err = root.querySelector<HTMLElement>('.gm-sp-editor-error')!
    expect(err.textContent).toContain('至少添加一个 feed')
  })

  test('rejects ttlMinutes <= 0 on save', async () => {
    const { root } = await setup()
    const ttl = root.querySelector<HTMLInputElement>('.gm-sp-tne-ttl')!
    ttl.value = '0'
    root.querySelector<HTMLButtonElement>('.gm-sp-tne-save')!.click()
    const err = root.querySelector<HTMLElement>('.gm-sp-editor-error')!
    expect(err.hidden).toBe(false)
  })

  test('saves valid section to CONFIG_KEY and closes', async () => {
    const { runtime, root } = await setup()
    const input = root.querySelector<HTMLInputElement>('.gm-sp-editor-input')!
    const addBtn = root.querySelector<HTMLButtonElement>('.gm-sp-tne-feed-add')!
    input.value = 'https://example.com/feed'
    addBtn.click()
    root.querySelector<HTMLButtonElement>('.gm-sp-tne-save')!.click()
    await new Promise((r) => setTimeout(r, 0))
    const cfg = runtime.stores['dashboard:v1:config'] as { tnews: typeof DEFAULT_OPTS } | undefined
    expect(cfg?.tnews.feeds).toContain('https://example.com/feed')
  })

  test('rejects duplicate feed URL', async () => {
    const { root } = await setup()
    const input = root.querySelector<HTMLInputElement>('.gm-sp-editor-input')!
    const addBtn = root.querySelector<HTMLButtonElement>('.gm-sp-tne-feed-add')!
    input.value = 'https://rsshub.app/telegram/channel/tnews365'
    addBtn.click()
    const err = root.querySelector<HTMLElement>('.gm-sp-editor-error')!
    expect(err.textContent).toContain('已在列表中')
  })

  test('loads existing feeds from CONFIG_KEY on open', async () => {
    const dom = makeDom()
    const runtime = makeRuntime(dom)
    runtime.stores['dashboard:v1:config'] = {
      tnews: {
        feeds: ['https://custom.example/feed'],
        mirrors: ['custom.mirror.example'],
        ttlMinutes: 45,
      },
    }
    const root = getRoot(dom)
    const editor = createTnewsEditor(DEFAULT_OPTS)
    await editor(root, { runtime, onRevert: () => {}, close: () => {} })
    expect(root.querySelector<HTMLInputElement>('.gm-sp-tne-ttl')!.value).toBe('45')
    const chips = Array.from(root.querySelectorAll<HTMLElement>('.gm-sp-tne-chip-label'))
    const labels = chips.map((c) => c.textContent)
    expect(labels).toContain('https://custom.example/feed')
    expect(labels).toContain('custom.mirror.example')
  })

  test('cancel button closes without saving', async () => {
    const { runtime, root } = await setup()
    const initialConfig = runtime.stores['dashboard:v1:config']
    root.querySelector<HTMLButtonElement>('.gm-sp-tne-cancel')!.click()
    expect(runtime.stores['dashboard:v1:config']).toBe(initialConfig)
  })
})
