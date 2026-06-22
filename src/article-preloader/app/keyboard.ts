import type { Selectors } from '../types'

let currentListener: ((evt: KeyboardEvent) => void) | null = null

export function wireKeyboardNav(
  doc: Document,
  selectors: Selectors,
  onArrowRight: () => void,
): void {
  if (currentListener) {
    doc.removeEventListener('keydown', currentListener)
  }

  currentListener = (evt) => {
    if (evt.key === 'ArrowLeft') {
      const prev = selectors.previousChapterLinkSelector()
      if (prev) doc.location.href = prev.getAttribute('href') || ''
    }
    if (evt.key === 'Enter') {
      const index = selectors.indexLinkSelector()
      if (index) doc.location.href = index.getAttribute('href') || ''
    }
    if (evt.key === 'ArrowRight') onArrowRight()
    evt.stopPropagation()
  }

  doc.addEventListener('keydown', currentListener)
}
