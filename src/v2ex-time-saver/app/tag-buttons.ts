import type { Runtime } from '../../runtime'
import { buildTagPanel, type TagPanelCallbacks, type QuickLabels } from '../../shared/tag-panel'
import type { AuthorTagMap } from '../../shared/author-labels'

export function ensureTagBtn(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  container: Element,
  id: string,
  commentNumber: number | string,
  ref: Element | null,
  callbacks: TagPanelCallbacks,
  quickLabels: QuickLabels,
): void {
  const btnClass = 'gm-tag-btn'
  if (container.querySelector(`.${btnClass}`)) return
  const btnHtml = `<a class="${btnClass}" href="#;">🏷</a>`
  if (ref) {
    ref.insertAdjacentHTML('afterend', btnHtml)
  } else {
    container.insertAdjacentHTML('beforeend', btnHtml)
  }
  const btn = (ref?.nextElementSibling ?? container.lastElementChild) as HTMLElement
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    buildTagPanel(runtime, authorTagMap, id, commentNumber, btn, callbacks, quickLabels)
  })
}

export function addTagPanel(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  callbacks: TagPanelCallbacks,
  quickLabels: QuickLabels,
): void {
  const topicAuthorId = runtime.document.querySelector('.header .avatar')?.getAttribute('alt')
  if (topicAuthorId) {
    const topicButtons = runtime.document.querySelector('.topic_buttons')
    if (topicButtons) {
      ensureTagBtn(
        runtime,
        authorTagMap,
        topicButtons,
        topicAuthorId,
        0,
        null,
        callbacks,
        quickLabels,
      )
    }
  }

  runtime.document.querySelectorAll('.cell').forEach((cell) => {
    const authorLink = cell.querySelector('strong > a[href]')
    if (!authorLink) return
    const id = authorLink.getAttribute('href')?.split('/')[2]
    if (!id) return
    const commentNumber = cell.querySelector('span.no')?.textContent?.trim()
    if (!commentNumber) return
    ensureTagBtn(runtime, authorTagMap, cell, id, commentNumber, authorLink, callbacks, quickLabels)
  })
}
