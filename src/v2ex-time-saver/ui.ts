import type { Runtime } from '../runtime'
import { getCommentNumber } from './comment-helpers'

export const collapseIconSvg = `
  <button class="gm collapse" title="折叠讨论">
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
    </svg>
  </button>
`

export const expandIconSvg = `
  <button class="gm expand" title="展开讨论">
    <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
    <span>展开讨论</span>
  </button>
`

export function createCollapseExpandButtons(
  runtime: Runtime,
  discussionCount: number,
  onclick: (evt: Event) => void,
): [HTMLButtonElement, HTMLButtonElement] {
  const temp = runtime.document.createElement('div')
  temp.insertAdjacentHTML('beforeend', collapseIconSvg)
  const collapseBtn = temp.firstElementChild as HTMLButtonElement
  temp.innerHTML = ''
  temp.insertAdjacentHTML('beforeend', expandIconSvg)
  const expandBtn = temp.firstElementChild as HTMLButtonElement

  collapseBtn.onclick = onclick
  expandBtn.onclick = onclick

  const span = expandBtn.querySelector('span')
  if (span) {
    span.innerHTML += `（${discussionCount}）`
  }

  return [collapseBtn, expandBtn]
}

export function createReferenceHint(
  runtime: Runtime,
  commentNumber: string,
  referencedCommentNumber: string,
  onclick: () => void,
): HTMLButtonElement {
  const temp = runtime.document.createElement('div')
  temp.insertAdjacentHTML(
    'beforeend',
    `<button type="button" class="gm-reference-hint">↪ #${commentNumber} 也回复了 #${referencedCommentNumber}</button>`,
  )
  const button = temp.firstElementChild as HTMLButtonElement
  button.addEventListener('click', onclick)
  return button
}

export function getOrCreateReferenceHintContainer(runtime: Runtime, host: Element): HTMLElement {
  const existing = host.querySelector(':scope > .gm-reference-hints')
  if (existing) {
    return existing as HTMLElement
  }

  const table = host.querySelector(':scope > table')
  if (table) {
    table.insertAdjacentHTML('afterend', '<div class="gm-reference-hints"></div>')
    return table.nextElementSibling as HTMLElement
  }
  host.insertAdjacentHTML('beforeend', '<div class="gm-reference-hints"></div>')
  return host.lastElementChild as HTMLElement
}

export function createReferenceDialog(
  runtime: Runtime,
  comment: Element,
  referencedComment: Element,
): void {
  const existingDialog = runtime.document.querySelector('.gm-reference-dialog')
  if (existingDialog) {
    existingDialog.remove()
  }

  runtime.document.body.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-reference-dialog" role="dialog" aria-modal="true">
      <div class="gm-reference-dialog-panel">
        <div class="gm-reference-dialog-header">引用回复 #${getCommentNumber(comment)}<button type="button" class="gm-reference-dialog-close">关闭</button></div>
        <div class="gm-reference-dialog-content">
          <div class="gm-dialog-card gm-dialog-context-card"><span class="gm-dialog-badge gm-dialog-context-badge">原回复</span></div>
          <div class="gm-dialog-connector">
            <svg xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
            </svg>
          </div>
          <div class="gm-dialog-card gm-dialog-reply-card"><span class="gm-dialog-badge gm-dialog-reply-badge">引用回复</span></div>
        </div>
      </div>
    </div>`,
  )
  const dialog = runtime.document.body.lastElementChild as HTMLDivElement

  const content = dialog.querySelector('.gm-reference-dialog-content')!

  const cleanComment = (node: Element) => {
    const cloned = node.cloneNode(true) as Element
    cloned.removeAttribute('id')
    cloned.querySelectorAll('[id]').forEach((it) => it.removeAttribute('id'))
    cloned.querySelectorAll('.gm, .gm-reference-hint').forEach((it) => it.remove())
    return cloned
  }

  const contextCard = content.querySelector('.gm-dialog-context-card')!
  contextCard.appendChild(cleanComment(referencedComment))

  const replyCard = content.querySelector('.gm-dialog-reply-card')!
  replyCard.appendChild(cleanComment(comment))

  const closeButton = dialog.querySelector('.gm-reference-dialog-close')!

  const close = () => {
    runtime.document.removeEventListener('keydown', onKeydown)
    dialog.remove()
  }
  const onKeydown = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') {
      close()
    }
  }

  closeButton.addEventListener('click', close)
  dialog.addEventListener('click', (evt) => {
    if (evt.target === dialog) {
      close()
    }
  })
  runtime.document.addEventListener('keydown', onKeydown)
}
