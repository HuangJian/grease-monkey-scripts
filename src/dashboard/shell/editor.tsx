import { useLayoutEffect, useRef } from 'preact/hooks'
import type { Runtime } from '../../runtime'
import type { Source, SourceEditorResult, SourceSettings } from '../types'
import { CONFIG_KEY, getSourceSettings } from '../types'
import { handleEscapeKey } from '../shortcut'
import { render } from 'preact'
import { h } from 'preact'
import type { VNode } from 'preact'

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

  useLayoutEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      handleEscapeKey(e, root, onClose)
    }
    doc.addEventListener('keydown', onKeydown, { capture: true })
    return () => doc.removeEventListener('keydown', onKeydown, { capture: true })
  }, [doc, root, onClose])

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
  root: ShadowRoot,
  title: string | VNode,
  runtime: Runtime,
  renderEditor: (
    container: HTMLElement,
    close: () => void,
  ) => SourceEditorResult | Promise<SourceEditorResult>,
): () => void {
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

export type EditHandlerArgs = {
  source: Source<unknown>
  runtime: Runtime
  root: ShadowRoot
  onRevert: (sourceId: string) => void
  onRefresh: (sourceId: string) => Promise<void>
}

export function createEditHandler({
  source,
  runtime,
  root,
  onRevert,
  onRefresh,
}: EditHandlerArgs): (() => Promise<void>) | undefined {
  if (!source.createEditor) return undefined
  return async () => {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const storedSettings =
      (stored?.sourceSettings as Record<string, SourceSettings> | undefined) ?? {}
    showEditorDialog(
      root,
      source.dialogTitle ?? `\u7F16\u8F91 - ${source.title}`,
      runtime,
      (container, close) => {
        const editor = source.createEditor!(getSourceSettings(storedSettings, source.id))
        return editor(container, {
          runtime,
          onRevert: () => onRevert(source.id),
          refresh: () => void onRefresh(source.id),
          close,
        })
      },
    )
  }
}
