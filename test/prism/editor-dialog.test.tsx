import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/preact'
import { showEditorDialog } from '../../src/prism/shell/editor'
import { EDITOR_DIALOG_SIZES, type SourceEditorResult } from '../../src/prism/types'
import { createRuntime, type TestRuntime } from '../runtime'

afterEach(cleanup)

function mountShadowRoot(): ShadowRoot {
  const host = document.createElement('div')
  document.body.appendChild(host)
  return host.attachShadow({ mode: 'open' })
}

function openEditor(
  runtime: TestRuntime,
  result: Partial<SourceEditorResult>,
  opts: { dirty?: boolean } = {},
): { root: ShadowRoot; closes: number; cancels: number } {
  const root = mountShadowRoot()
  const state = { closes: 0, cancels: 0 }
  const close = showEditorDialog(root, '编辑', runtime, (_container, closeEditor) => ({
    render: () => {},
    save: () => {},
    // Real forms end their cancel by calling `ctx.close()`, which is this very
    // callback — the mock has to do the same or the guard's recursion is hidden.
    cancel: () => {
      state.cancels += 1
      closeEditor()
    },
    ...result,
    ...(opts.dirty === undefined ? {} : { isDirty: () => opts.dirty === true }),
  }))
  // `showEditorDialog` returns its own close; the dialog also calls it.
  void close
  return { root, ...state }
}

function panelWidthVar(root: ShadowRoot): string | null {
  const panel = root.querySelector<HTMLElement>('.gm-sp-editor-dialog-panel')
  return panel?.style.getPropertyValue('--gm-sp-editor-dialog-w') ?? null
}

describe('editor dialog sizing', () => {
  test('uses the width the editor declares', async () => {
    const runtime = createRuntime()
    const { root } = openEditor(runtime, { size: 'lg' })
    await waitFor(() => {
      expect(panelWidthVar(root)).toBe(`${EDITOR_DIALOG_SIZES.lg}px`)
    })
  })

  test('falls back to md when the editor declares nothing', async () => {
    const runtime = createRuntime()
    const { root } = openEditor(runtime, {})
    await waitFor(() => {
      expect(panelWidthVar(root)).toBe(`${EDITOR_DIALOG_SIZES.md}px`)
    })
  })

  test('every size resolves to a distinct width', () => {
    // The point of the tiers: an empty form and a hundred-row form do not get
    // the same box.
    const widths = Object.values(EDITOR_DIALOG_SIZES)
    expect(new Set(widths).size).toBe(widths.length)
    expect(widths.every((w) => w > 0)).toBe(true)
  })
})

describe('editor dialog unsaved-changes guard', () => {
  /**
   * Waits until the dialog has read the editor's result — until then it has no
   * `isDirty` to consult. A real reader cannot click before the form exists.
   */
  async function open(dirty: boolean): Promise<ShadowRoot> {
    const runtime = createRuntime()
    const { root } = openEditor(runtime, {}, { dirty })
    await waitFor(() => {
      expect(panelWidthVar(root)).not.toBe('')
    })
    return root
  }

  test('a clean form closes on cancel without asking', async () => {
    const root = await open(false)
    const cancel = root.querySelector<HTMLButtonElement>(
      '.gm-sp-editor-dialog-actions .gm-sp-btn:not(.gm-sp-btn-primary)',
    )!
    cancel.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="discard-guard"]')).toBeNull()
    })
    // Closed: nothing left to render into.
    expect(root.querySelector('.gm-sp-editor-dialog')).toBeNull()
  })

  test('a dirty form asks before discarding', async () => {
    const root = await open(true)
    const cancel = root.querySelector<HTMLButtonElement>(
      '.gm-sp-editor-dialog-actions .gm-sp-btn:not(.gm-sp-btn-primary)',
    )!
    cancel.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="discard-guard"]')).not.toBeNull()
    })
    // Still open — the form was not torn down.
    expect(root.querySelector('.gm-sp-editor-dialog')).not.toBeNull()
  })

  test('继续编辑 dismisses the guard and keeps the form', async () => {
    const root = await open(true)
    root
      .querySelector<HTMLButtonElement>(
        '.gm-sp-editor-dialog-actions .gm-sp-btn:not(.gm-sp-btn-primary)',
      )!
      .click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="discard-guard"]')).not.toBeNull()
    })
    const keep = Array.from(root.querySelectorAll<HTMLButtonElement>('.gm-sp-btn')).find(
      (b) => b.textContent === '继续编辑',
    )!
    keep.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="discard-guard"]')).toBeNull()
    })
    expect(root.querySelector('.gm-sp-editor-dialog')).not.toBeNull()
  })

  test('放弃改动 closes and runs the form cancel', async () => {
    const root = await open(true)
    root
      .querySelector<HTMLButtonElement>(
        '.gm-sp-editor-dialog-actions .gm-sp-btn:not(.gm-sp-btn-primary)',
      )!
      .click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="discard-guard"]')).not.toBeNull()
    })
    const discard = Array.from(root.querySelectorAll<HTMLButtonElement>('.gm-sp-btn')).find(
      (b) => b.textContent === '放弃改动',
    )!
    discard.click()
    await waitFor(() => {
      expect(root.querySelector('.gm-sp-editor-dialog')).toBeNull()
    })
  })
})
