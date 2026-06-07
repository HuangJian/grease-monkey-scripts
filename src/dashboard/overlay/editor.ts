import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'

export function showEditorDialog(
  document: Document,
  root: ShadowRoot,
  title: string,
  runtime: Runtime,
  renderEditor: (container: HTMLElement, close: () => void) => void,
): () => void {
  const backdrop = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-editor-dialog">
      <div class="gm-sp-editor-dialog-panel">
        <div class="gm-sp-editor-dialog-header">
          <span class="gm-sp-editor-dialog-title">${title}</span>
          <button type="button" class="gm-sp-editor-dialog-close" aria-label="close">×</button>
        </div>
        <div class="gm-sp-editor-dialog-body"></div>
      </div>
    </div>`,
  )

  const panel = backdrop.querySelector('.gm-sp-editor-dialog-panel') as HTMLDivElement
  const closeBtn = backdrop.querySelector('.gm-sp-editor-dialog-close') as HTMLButtonElement
  const body = backdrop.querySelector('.gm-sp-editor-dialog-body') as HTMLDivElement

  function close(): void {
    backdrop.remove()
  }

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close()
  })
  closeBtn.addEventListener('click', close)
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    }
  }
  document.addEventListener('keydown', onKeydown, { capture: true })

  const origRemove = backdrop.remove.bind(backdrop)
  backdrop.remove = () => {
    document.removeEventListener('keydown', onKeydown, { capture: true })
    origRemove()
  }

  renderEditor(body, close)
  root.appendChild(backdrop)
  panel.focus()
  return close
}
