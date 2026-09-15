import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/preact'
import { RenderCard } from '../../../src/prism/card/card'
import { saveCache } from '../../../src/prism/cache'
import { showEditorDialog } from '../../../src/prism/shell/editor'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../../src/prism/types'
import { createXitSource } from '../../../src/prism/xit/source'
import type { XitData } from '../../../src/prism/xit/types'
import { createRuntime } from '../../runtime'

afterEach(cleanup)

const XIT_TEXT = '[ ] buy milk\n[ ] write tests\n'

const cachedXit: CachedSource<XitData> = {
  schemaVersion: CACHE_SCHEMA_VERSION,
  data: { text: XIT_TEXT },
  fetchedAt: 1,
  error: '',
}

/**
 * Mount the real xit source through `RenderCard`, which is where the card
 * injects `showEditorDialog` into `SourceComponentProps`.
 *
 * `root` must be a genuine `ShadowRoot`: `openEditor` guards on
 * `root instanceof ShadowRoot`, so the plain-div cast used by other card tests
 * would make the dialog unreachable for reasons unrelated to the wiring.
 */
async function renderXitCard(): Promise<{
  container: HTMLElement
  root: ShadowRoot
  runtime: ReturnType<typeof createRuntime>
}> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: 'open' })
  const runtime = createRuntime()
  const source = createXitSource(undefined, runtime)

  // The editor reads the text from the cache (not from the rendered data), so
  // seed the cache the same way the app does.
  await saveCache(runtime, 'xit', { data: { text: XIT_TEXT }, fetchedAt: 1, error: '' })

  const { container } = render(
    <RenderCard
      source={source}
      cached={cachedXit}
      ttlMs={source.ttlMs}
      now={runtime.now()}
      runtime={runtime}
      root={root}
      onRefresh={() => Promise.resolve()}
      onRevert={() => {}}
      showEditorDialog={showEditorDialog}
    />,
  )

  return { container: container as unknown as HTMLElement, root, runtime }
}

describe('xit item editor', () => {
  test('double-clicking an item opens the editor dialog', async () => {
    const { container, root } = await renderXitCard()

    const item = container.querySelector<HTMLElement>('.gm-sp-xit-item')
    expect(item).not.toBeNull()
    expect(item!.dataset['lineIndex']).toBe('0')

    item!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    // The editor is async (it loads the cached text first), and it mounts into
    // `root` — not into the render container.
    await waitFor(() => {
      expect(root.querySelector('.gm-sp-xit-editor-textarea')).not.toBeNull()
    })
    expect((root.querySelector('.gm-sp-xit-editor-textarea') as HTMLTextAreaElement).value).toBe(
      XIT_TEXT,
    )
  })

  test('double-clicking does nothing outside an item', async () => {
    const { container, root } = await renderXitCard()

    const heading = container.querySelector<HTMLElement>('.gm-sp-xit-list')
    expect(heading).not.toBeNull()
    heading!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(root.querySelector('.gm-sp-xit-editor-textarea')).toBeNull()
  })
})
