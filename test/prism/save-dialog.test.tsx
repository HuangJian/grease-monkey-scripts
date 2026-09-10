import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/preact'
import { showSaveDialog } from '../../src/prism/save-dialog'
import { CACHE_KEY, STATE_KEY } from '../../src/prism/types'
import { formatByteSize, utf8ByteLength } from '../../src/prism/shared-utils'
import { createRuntime, type TestRuntime } from '../runtime'

afterEach(cleanup)

function mountShadowRoot(): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

function sizeLabels(root: ShadowRoot): string[] {
  return Array.from(root.querySelectorAll('[data-action="key-size"]')).map(
    (el) => el.textContent ?? '',
  )
}

describe('showSaveDialog storage sizes', () => {
  test('shows the byte size of each stored key', async () => {
    const runtime: TestRuntime = createRuntime()
    const rssCache = { schemaVersion: 2, data: [{ id: 'u:a', title: '源' }], fetchedAt: 1 }
    runtime.stores[CACHE_KEY('rss')] = rssCache
    runtime.stores[STATE_KEY('rss')] = { 'https://example.com/1': { r: 1 } }

    const root = mountShadowRoot()
    showSaveDialog(root, runtime)

    const expected = formatByteSize(utf8ByteLength(JSON.stringify(rssCache)))
    await waitFor(() => {
      expect(sizeLabels(root)).toContain(expected)
    })
  })

  test('omits the size for the virtual xueqiu-hot entry', async () => {
    const runtime: TestRuntime = createRuntime()
    runtime.stores[CACHE_KEY('xueqiu-news')] = { schemaVersion: 2, data: {}, fetchedAt: 1 }

    const root = mountShadowRoot()
    showSaveDialog(root, runtime)

    await waitFor(() => {
      expect(root.textContent).toContain('雪球新闻 缓存')
    })
    // Two entries are listed (xueqiu-news + the virtual xueqiu-hot), one size.
    const sizes = sizeLabels(root)
    expect(sizes).toHaveLength(1)
  })

  test('shows no sizes when nothing is stored', async () => {
    const runtime: TestRuntime = createRuntime()
    const root = mountShadowRoot()
    showSaveDialog(root, runtime)
    await waitFor(() => {
      expect(root.textContent).toContain('暂无可保存数据')
    })
    expect(sizeLabels(root)).toHaveLength(0)
  })
})
