import type { Runtime } from '../../runtime'
import { SELECTORS } from './selectors'

export function getCommentNumber(comment: Element): string {
  return comment.querySelector(SELECTORS.commentNumber)?.textContent?.trim() || ''
}

export function findCommentBox(doc: ParentNode): Element | null {
  const boxes = doc.querySelectorAll(SELECTORS.mainBoxes)
  console.debug('[v2ex] findCommentBox', { boxCount: boxes.length })
  for (const box of boxes) {
    const cells = box.querySelectorAll(SELECTORS.cellInBox)
    const firstCellText = box
      .querySelector(SELECTORS.firstCellInBox)
      ?.textContent?.trim()
      .slice(0, 50)
    console.debug('[v2ex] findCommentBox - check box', {
      id: (box as Element).id || '(none)',
      class: (box as Element).className || '(none)',
      cellCount: cells.length,
      firstCellText,
    })
    if (cells.length > 0) {
      return box
    }
  }
  return null
}

export function findCommentCells(doc: ParentNode): Element[] {
  const box = findCommentBox(doc)
  if (!box) return []
  return Array.from(box.querySelectorAll(SELECTORS.cellInBox))
}

export function findFirstCommentCell(doc: ParentNode): Element | null {
  const box = findCommentBox(doc)
  return box?.querySelector(SELECTORS.firstCellInBox) ?? null
}

export function getCommentElementsFromHtmlString(
  runtime: Runtime,
  htmlString: string,
): NodeListOf<Element> {
  const domParser = new runtime.DOMParser()
  const dom = domParser.parseFromString(htmlString, 'text/html')
  const cells = dom.querySelectorAll(SELECTORS.parsedCells)
  console.debug('[v2ex] getCommentElementsFromHtmlString', { count: cells.length })
  if (cells.length === 0) {
    const boxCount = dom.querySelectorAll(SELECTORS.mainBoxes).length
    const cellCount = dom.querySelectorAll(SELECTORS.parsedCells).length
    console.debug('[v2ex] getCommentElementsFromHtmlString - no cells', { boxCount, cellCount })
  }
  return cells
}
