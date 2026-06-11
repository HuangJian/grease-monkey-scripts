import type { Runtime } from '../../runtime'
import type { SourceEditorResult } from '../types'
import { handleEscapeKey } from '../shortcut'

export function showEditorDialog(
  document: Document,
  root: ShadowRoot,
  title: string,
  runtime: Runtime,
  renderEditor: (
    container: HTMLElement,
    close: () => void,
  ) => SourceEditorResult | Promise<SourceEditorResult>,
): () => void {
  const dialogFragment = document.createRange().createContextualFragment(
    `<div class="gm-sp-editor-dialog">
      <div class="gm-sp-editor-dialog-panel">
        <div class="gm-sp-editor-dialog-header">
          <span class="gm-sp-editor-dialog-title">${title}</span>
          <div class="gm-sp-editor-dialog-actions">
            <button type="button" class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-primary gm-sp-editor-dialog-save">保存</button>
            <button type="button" class="gm-sp-editor-btn gm-sp-btn gm-sp-editor-dialog-cancel">取消</button>
          </div>
        </div>
        <div class="gm-sp-editor-dialog-body"></div>
      </div>
    </div>`,
  )
  const backdrop = dialogFragment.firstElementChild as HTMLDivElement

  const panel = backdrop.querySelector('.gm-sp-editor-dialog-panel') as HTMLDivElement
  const body = backdrop.querySelector('.gm-sp-editor-dialog-body') as HTMLDivElement
  const saveBtn = backdrop.querySelector('.gm-sp-editor-dialog-save') as HTMLButtonElement
  const cancelBtn = backdrop.querySelector('.gm-sp-editor-dialog-cancel') as HTMLButtonElement

  function close(): void {
    backdrop.remove()
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })
  const onKeydown = (e: KeyboardEvent) => {
    handleEscapeKey(e, root, close)
  }
  document.addEventListener('keydown', onKeydown, { capture: true })

  const origRemove = backdrop.remove.bind(backdrop)
  backdrop.remove = () => {
    document.removeEventListener('keydown', onKeydown, { capture: true })
    origRemove()
  }

  const result = renderEditor(body, close)
  Promise.resolve(result).then((r) => {
    if (body.classList.contains('gm-sp-xit-editor-dual')) {
      panel.style.width = '1200px'
    }
    cancelBtn.addEventListener('click', () => {
      r.cancel?.()
    })
    if (r.save) {
      saveBtn.addEventListener('click', () => {
        void r.save!()
      })
    }
  })

  root.appendChild(backdrop)
  panel.focus()
  return close
}
