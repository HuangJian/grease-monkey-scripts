import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import type { EditorDialogSize, ShowEditorDialog, SourceEditorResult } from '../types'
import { EDITOR_DIALOG_SIZES } from '../types'
import { handleEscapeKey } from '../shortcut'
import { render } from 'preact'
import type { VNode } from 'preact'

/** Width for a declared size, falling back to `md`. The stylesheet clamps it. */
function sizePx(size: EditorDialogSize | undefined): number {
  return EDITOR_DIALOG_SIZES[size ?? 'md']
}

type EditorDialogProps = {
  doc: Document
  root: ShadowRoot
  title: string | VNode
  onClose: () => void
  renderEditor: (
    container: HTMLElement,
    close: () => void,
  ) => SourceEditorResult | Promise<SourceEditorResult>
}

function EditorDialog({ doc, root, title, onClose, renderEditor }: EditorDialogProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<SourceEditorResult | null>(null)
  /** Set when a close was requested while the form holds unsaved edits. */
  const [confirmingClose, setConfirmingClose] = useState(false)

  /**
   * Closing runs through the form's own `cancel` (it owns teardown), then closes.
   *
   * The guard lives on the *dialog's* exits — 取消, the backdrop, ESC. The form
   * keeps the raw `onClose` as its `ctx.close`, because a form that closes itself
   * (after a successful save, or from its own 取消 handler) has already decided
   * that closing is right; routing that through the guard made 取消 ask for
   * confirmation and then re-enter itself forever, so the dialog never closed.
   */
  function closeNow() {
    resultRef.current?.cancel?.()
    onClose()
  }

  /** The guarded exit: only the reader can trigger this. */
  function requestClose() {
    if (resultRef.current?.isDirty?.()) {
      setConfirmingClose(true)
      return
    }
    closeNow()
  }

  useLayoutEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      handleEscapeKey(e, root, requestClose)
    }
    doc.addEventListener('keydown', onKeydown, { capture: true })
    return () => doc.removeEventListener('keydown', onKeydown, { capture: true })
  }, [doc, root])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    // Raw `onClose`, not `requestClose`: see `closeNow`.
    const result = renderEditor(body, onClose)
    Promise.resolve(result).then((r) => {
      resultRef.current = r
      // One width, declared by the editor and clamped by the stylesheet — the
      // old code special-cased xit's dual mode with a hardcoded 1200px.
      if (panelRef.current) {
        panelRef.current.style.setProperty('--gm-sp-editor-dialog-w', `${sizePx(r.size)}px`)
      }
    })
  }, [])

  useLayoutEffect(() => {
    panelRef.current?.focus()
  }, [])

  return (
    <div
      class="gm-sp-editor-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
    >
      <div class="gm-sp-editor-dialog-panel" ref={panelRef} tabIndex={-1}>
        <div class="gm-sp-editor-dialog-header">
          <span class="gm-sp-editor-dialog-title">{title}</span>
          <div class="gm-sp-editor-dialog-actions">
            <button
              type="button"
              class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-primary"
              onClick={() => {
                resultRef.current?.save?.()
              }}
            >
              保存
            </button>
            <button type="button" class="gm-sp-editor-btn gm-sp-btn" onClick={requestClose}>
              取消
            </button>
          </div>
        </div>
        {confirmingClose ? (
          <div class="gm-sp-editor-dialog-confirm" role="alertdialog" data-action="discard-guard">
            <span>有未保存的改动，确定放弃？</span>
            <button type="button" class="gm-sp-editor-btn gm-sp-btn" onClick={closeNow}>
              放弃改动
            </button>
            <button
              type="button"
              class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-primary"
              onClick={() => setConfirmingClose(false)}
            >
              继续编辑
            </button>
          </div>
        ) : null}
        <div class="gm-sp-editor-dialog-body" ref={bodyRef}></div>
      </div>
    </div>
  )
}

export const showEditorDialog: ShowEditorDialog = (root, title, runtime, renderEditor) => {
  const container = runtime.document.createElement('div')
  root.appendChild(container)
  const close = () => {
    render(null, container)
    container.remove()
  }
  render(
    <EditorDialog
      doc={runtime.document}
      root={root}
      title={title}
      onClose={close}
      renderEditor={renderEditor}
    />,
    container,
  )
  return close
}
