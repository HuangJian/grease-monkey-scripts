import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import { buildTagPanel, type TagPanelCallbacks, type QuickLabels } from '../../shared/tag-panel'
import { findAllAuthorLinks, isAuthorNameLink, extractEuid } from '../selectors'

export const BTN_CLASS = 'gm-tag-btn'
export const PROCESSED_CLASS = 'gm-processed'

export function attachTagButton(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  euidToPuidMap: Map<string, string>,
  tagAuthor: (id: string, commentNumber: number | string, tag: string, delta: number) => void,
  setTag: (id: string, tag: string, score: number, commentNumber: number | string) => void,
  unsetTag: (id: string, tag: string) => void,
  quickLabels: QuickLabels,
  authorLink: Element,
): void {
  const euid = extractEuid(authorLink.getAttribute('href') || '')
  if (!euid) return
  const puid = euidToPuidMap.get(euid) || euid

  authorLink.classList.add(PROCESSED_CLASS)
  authorLink.insertAdjacentHTML('afterend', `<a class="${BTN_CLASS}" href="#;">🏷</a>`)
  const btn = authorLink.nextElementSibling as HTMLElement
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    const callbacks: TagPanelCallbacks = {
      onTagAuthor: (id, commentNum, tag, delta) => tagAuthor(id, commentNum, tag, delta),
      onSetTag: (id, tag, score, commentNum) => setTag(id, tag, score, commentNum),
      onUnsetTag: (id, tag) => unsetTag(id, tag),
    }
    buildTagPanel(runtime, authorTagMap, puid, euid, btn, callbacks, quickLabels)
  })
  authorLink.insertAdjacentElement('afterend', btn)
}

export function processElement(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  euidToPuidMap: Map<string, string>,
  tagAuthor: (id: string, commentNumber: number | string, tag: string, delta: number) => void,
  setTag: (id: string, tag: string, score: number, commentNumber: number | string) => void,
  unsetTag: (id: string, tag: string) => void,
  quickLabels: QuickLabels,
  root: Node,
): void {
  for (const link of findAllAuthorLinks(root as Element)) {
    if (link.classList.contains(PROCESSED_CLASS)) continue
    if (!isAuthorNameLink(link)) continue
    attachTagButton(
      runtime,
      authorTagMap,
      euidToPuidMap,
      tagAuthor,
      setTag,
      unsetTag,
      quickLabels,
      link,
    )
  }
}
