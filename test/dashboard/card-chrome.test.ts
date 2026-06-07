import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderCardChrome } from '../../src/dashboard/overlay/card-chrome'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime } from '../runtime'

function cached<T>(partial: Omit<CachedSource<T>, 'schemaVersion' | 'byteSize'>): CachedSource<T> {
  return { schemaVersion: CACHE_SCHEMA_VERSION, byteSize: 0, ...partial }
}

function setup() {
  const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
  const container = dom.window.document.getElementById('c') as HTMLElement
  const runtime = createRuntime(dom)
  const root = dom.window.document.createElement('div') as unknown as ShadowRoot
  return { dom, container, runtime, root }
}

function baseOpts(opts: Partial<Parameters<typeof renderCardChrome>[1]> = {}) {
  return {
    root: opts.root!,
    runtime: opts.runtime!,
    now: opts.now ?? 1_000_000,
    ttlMs: opts.ttlMs ?? 60_000,
    cached: opts.cached ?? null,
    titleHtml: opts.titleHtml ?? '<span>title</span>',
    bodyHtml: opts.bodyHtml ?? '',
    onRefresh: opts.onRefresh ?? (() => Promise.resolve()),
    edit: opts.edit,
  }
}

describe('renderCardChrome', () => {
  test('returns references to header, body, and refresh button', () => {
    const { container, runtime, root } = setup()
    const chrome = renderCardChrome(container, baseOpts({ runtime, root }))
    expect(chrome.header.classList.contains('gm-sp-card-header')).toBe(true)
    expect(chrome.body.classList.contains('gm-sp-card-body')).toBe(true)
    expect(chrome.refreshButton.classList.contains('gm-sp-refresh')).toBe(true)
  })

  test('omits stale badge when cache is fresh', () => {
    const { container, runtime, root } = setup()
    const c = renderCardChrome(container, {
      ...baseOpts({ runtime, root }),
      cached: cached({ fetchedAt: 999_000 }),
    })
    expect(c.header.querySelector('.gm-sp-card-stale')).toBeNull()
  })

  test('shows stale badge when cache is very old', () => {
    const { container, runtime, root } = setup()
    const c = renderCardChrome(container, {
      ...baseOpts({ runtime, root, now: 1_000_000, ttlMs: 60_000 }),
      cached: cached({ fetchedAt: 1_000_000 - 60 * 60_000 * 4 }),
    })
    const badge = c.header.querySelector('.gm-sp-card-stale')
    expect(badge).not.toBeNull()
    expect(badge!.textContent).toBe('数据陈旧')
  })

  test('shows error block only when cached.error is set', () => {
    const { container, runtime, root } = setup()
    const noErr = renderCardChrome(container, baseOpts({ runtime, root }))
    expect(noErr.body.parentElement!.querySelector('.gm-sp-error')).toBeNull()
    const withErr = renderCardChrome(
      container,
      baseOpts({ runtime, root, cached: cached({ fetchedAt: 1, error: 'boom' }) }),
    )
    const errBlock = withErr.body.parentElement!.querySelector('.gm-sp-error')
    expect(errBlock).not.toBeNull()
    expect(errBlock!.textContent).toBe('boom')
  })

  test('omits edit button when edit option is not provided', () => {
    const { container, runtime, root } = setup()
    const c = renderCardChrome(container, baseOpts({ runtime, root }))
    expect(c.header.querySelector('.gm-sp-edit')).toBeNull()
  })

  test('shows edit button and opens dialog when edit option is provided', () => {
    const { container, runtime, root, dom } = setup()
    let revertCalls = 0
    const c = renderCardChrome(container, {
      ...baseOpts({ runtime, root }),
      edit: {
        sourceTitle: 'Edit Title',
        createEditor: () => (body, ctx) => {
          body.textContent = 'editor-body'
          ctx.onRevert()
        },
        onRevert: () => {
          revertCalls++
        },
      },
    })
    expect(c.header.querySelector('.gm-sp-edit')).not.toBeNull()
    ;(c.header.querySelector('.gm-sp-edit') as HTMLButtonElement).click()
    const dialog = (root as unknown as HTMLElement).querySelector('.gm-sp-editor-dialog')
    expect(dialog).not.toBeNull()
    expect(dialog!.querySelector('.gm-sp-editor-dialog-title')!.textContent).toBe('Edit Title')
    expect(dialog!.querySelector('.gm-sp-editor-dialog-body')!.textContent).toBe('editor-body')
    expect(revertCalls).toBe(1)
    // Suppress unused-var warning for dom.
    void dom
  })

  test('refresh button toggles loading state and clears it on resolve', async () => {
    const { container, runtime, root } = setup()
    let resolveRefresh!: () => void
    const c = renderCardChrome(container, {
      ...baseOpts({ runtime, root }),
      onRefresh: () => new Promise<void>((r) => (resolveRefresh = r)),
    })
    c.refreshButton.click()
    expect(c.refreshButton.classList.contains('gm-sp-refresh-loading')).toBe(true)
    expect(c.refreshButton.disabled).toBe(true)
    resolveRefresh()
    await new Promise((r) => setTimeout(r, 0))
    expect(c.refreshButton.classList.contains('gm-sp-refresh-loading')).toBe(false)
    expect(c.refreshButton.disabled).toBe(false)
  })

  test('refresh button clears loading state on rejection', async () => {
    const { container, runtime, root } = setup()
    let rejectRefresh!: (e: Error) => void
    const c = renderCardChrome(container, {
      ...baseOpts({ runtime, root }),
      onRefresh: () => new Promise<void>((_r, rej) => (rejectRefresh = rej)),
    })
    const origErr = console.error
    console.error = () => {}
    try {
      c.refreshButton.click()
      rejectRefresh(new Error('boom'))
      await new Promise((r) => setTimeout(r, 0))
      expect(c.refreshButton.classList.contains('gm-sp-refresh-loading')).toBe(false)
      expect(c.refreshButton.disabled).toBe(false)
    } finally {
      console.error = origErr
    }
  })

  test('clears prior children when re-rendering into the same container', () => {
    const { container, runtime, root } = setup()
    container.innerHTML = '<legacy-tag>stale</legacy-tag>'
    const c = renderCardChrome(container, baseOpts({ runtime, root }))
    expect(container.querySelector('legacy-tag')).toBeNull()
    expect(c.header).not.toBeNull()
  })

  test('inlines titleHtml and bodyHtml verbatim into the card', () => {
    const { container, runtime, root } = setup()
    const c = renderCardChrome(
      container,
      baseOpts({
        runtime,
        root,
        titleHtml: '<span class="gm-sp-card-title-text">My Title</span>',
        bodyHtml: '<div class="gm-sp-tab-panel"></div>',
      }),
    )
    expect(c.header.querySelector('.gm-sp-card-title-text')!.textContent).toBe('My Title')
    expect(c.body.querySelector('.gm-sp-tab-panel')).not.toBeNull()
  })
})
