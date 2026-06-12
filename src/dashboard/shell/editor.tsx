import { useLayoutEffect, useRef } from 'preact/hooks'
import type { Runtime } from '../../runtime'
import type { SourceEditorResult } from '../types'
import { handleEscapeKey } from '../shortcut'
import { render } from 'preact'
import { h } from 'preact'

type EditorDialogProps = {
  document: Document
  root: ShadowRoot
  title: string
  onClose: () => void
  renderEditor: (
    container: HTMLElement,
    close: () => void,
  ) => SourceEditorResult | Promise<SourceEditorResult>
}

function EditorDialog({ document, root, title, onClose, renderEditor }: EditorDialogProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<SourceEditorResult | null>(null)

  useLayoutEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      handleEscapeKey(e, root, onClose)
    }
    document.addEventListener('keydown', onKeydown, { capture: true })
    return () => document.removeEventListener('keydown', onKeydown, { capture: true })
  }, [document, root, onClose])

  useLayoutEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const result = renderEditor(body, onClose)
    Promise.resolve(result).then((r) => {
      resultRef.current = r
      if (body.classList.contains('gm-sp-xit-editor-dual') && panelRef.current) {
        panelRef.current.style.width = '1200px'
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
        if (e.target === e.currentTarget) onClose()
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
            <button
              type="button"
              class="gm-sp-editor-btn gm-sp-btn"
              onClick={() => {
                resultRef.current?.cancel?.()
              }}
            >
              取消
            </button>
          </div>
        </div>
        <div class="gm-sp-editor-dialog-body" ref={bodyRef}></div>
      </div>
    </div>
  )
}

export function showEditorDialog(
  document: Document,
  root: ShadowRoot,
  title: string,
  _runtime: Runtime,
  renderEditor: (
    container: HTMLElement,
    close: () => void,
  ) => SourceEditorResult | Promise<SourceEditorResult>,
): () => void {
  const container = document.createElement('div')
  root.appendChild(container)
  const close = () => {
    render(null, container)
    container.remove()
  }
  render(
    <EditorDialog
      document={document}
      root={root}
      title={title}
      onClose={close}
      renderEditor={renderEditor}
    />,
    container,
  )
  return close
}
