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
    // Arrow keys move the caret inside a field. Stealing them there makes the
    // page flip while the reader is typing in a search box.
    const target = evt.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return
    }
    if (evt.key === 'ArrowLeft') {
      const prev = selectors.previousChapterLinkSelector()
      if (prev) doc.location.href = prev.getAttribute('href') || ''
    } else if (evt.key === 'Enter') {
      const index = selectors.indexLinkSelector()
      if (index) doc.location.href = index.getAttribute('href') || ''
    } else if (evt.key === 'ArrowRight') {
      onArrowRight()
    } else {
      return
    }
    // Arrow keys scroll the page by default; that interferes with the
    // instant chapter swap and makes scrolling look like a failed keypress.
    evt.preventDefault()
    evt.stopPropagation()
  }

  doc.addEventListener('keydown', currentListener)
}
