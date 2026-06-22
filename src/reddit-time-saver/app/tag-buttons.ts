import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import { buildTagPanel, type TagPanelCallbacks, type QuickLabels } from '../../shared/tag-panel'
import { findAuthorLinks, getAuthorName, getCommentId, isAuthorHeader } from './author-utils'

export const BTN_CLASS = 'gm-tag-btn'
export const PROCESSED_CLASS = 'gm-processed'

export function attachTagButton(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  tagAuthor: (username: string, commentId: string, tag: string, delta: number) => void,
  setTag: (username: string, tag: string, score: number, commentId: string) => void,
  unsetTag: (username: string, tag: string) => void,
  authorLink: Element,
): void {
  if (authorLink.classList.contains(PROCESSED_CLASS)) return
  const username = getAuthorName(authorLink)
  if (!username) return

  const commentId = getCommentId(authorLink)

  const authorNameSlot = authorLink.closest('span[slot="authorName"]')
  if (authorNameSlot) {
    if (authorNameSlot.classList.contains(PROCESSED_CLASS)) return
    authorNameSlot.classList.add(PROCESSED_CLASS)
  } else {
    const meta = authorLink.closest('[slot="commentMeta"]')
    if (meta) {
      if (meta.classList.contains(PROCESSED_CLASS)) return
      meta.classList.add(PROCESSED_CLASS)
    } else {
      if (authorLink.nextElementSibling?.classList.contains(BTN_CLASS)) return
    }
  }

  authorLink.classList.add(PROCESSED_CLASS)
  authorLink.insertAdjacentHTML('afterend', `<a class="${BTN_CLASS}" href="#;">🏷</a>`)
  const btn = authorLink.nextElementSibling as HTMLElement
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    const callbacks: TagPanelCallbacks = {
      onTagAuthor: (id, commentNum, tag, delta) => tagAuthor(id, commentNum as string, tag, delta),
      onSetTag: (id, tag, score, commentNum) => setTag(id, tag, score, commentNum as string),
      onUnsetTag: (id, tag) => unsetTag(id, tag),
    }
    const quickLabels: QuickLabels = {
      shame: { tag: '若婴', display: '若婴' },
      thank: { tag: '智者', display: '智者' },
    }
    buildTagPanel(runtime, authorTagMap, username, commentId, btn, callbacks, quickLabels)
  })
  if (authorNameSlot) {
    authorNameSlot.insertAdjacentElement('afterend', btn)
  } else {
    const meta = authorLink.closest('[slot="commentMeta"]')
    if (meta) {
      meta.appendChild(btn)
    } else {
      authorLink.insertAdjacentElement('afterend', btn)
    }
  }
}

export function processElement(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  tagAuthor: (username: string, commentId: string, tag: string, delta: number) => void,
  setTag: (username: string, tag: string, score: number, commentId: string) => void,
  unsetTag: (username: string, tag: string) => void,
  root: Node,
): void {
  const links = findAuthorLinks(root)
  for (const link of links) {
    if (!isAuthorHeader(link)) continue
    const username = getAuthorName(link)
    if (!username) continue
    if (link.classList.contains(PROCESSED_CLASS)) continue
    attachTagButton(runtime, authorTagMap, tagAuthor, setTag, unsetTag, link)
  }
}
