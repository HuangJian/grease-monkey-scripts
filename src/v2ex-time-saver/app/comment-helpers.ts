import type { Runtime } from '../../runtime'
import { SELECTORS } from './selectors'

export function getCommentNumber(comment: Element): string {
  return comment.querySelector(SELECTORS.commentNumber)?.textContent?.trim() || ''
}

/**
 * Reply cells, ignoring any `.cell[id]` that is not a reply.
 *
 * V2EX also gives the topic body cell an id, so the id alone no longer
 * identifies a reply; a reply always carries a floor number (`span.no`).
 * Falling back to every id'd cell keeps the previous behavior if V2EX renames
 * the floor number again.
 */
function findReplyCells(doc: ParentNode): Element[] {
  const cells = Array.from(doc.querySelectorAll(SELECTORS.mainCells))
  const numbered = cells.filter((it) => it.querySelector(SELECTORS.commentNumberSpan) !== null)
  return numbered.length > 0 ? numbered : cells
}

/**
 * The `.box` that directly holds the reply cells.
 *
 * It used to be `#Main > .box`; the current markup nests the replies one box
 * deeper (`#Main > .box.reply-box > … > .box > .cell[id]`), so resolve the
 * container from the cells instead of matching a fixed path.
 */
export function findCommentBox(doc: ParentNode): Element | null {
  const replies = findReplyCells(doc)
  const box = replies[0]?.closest(SELECTORS.box) ?? null
  console.debug('[v2ex] findCommentBox', {
    replyCount: replies.length,
    box: box ? box.className || '(none)' : '(none)',
  })
  return box
}

export function findCommentCells(doc: ParentNode): Element[] {
  const box = findCommentBox(doc)
  if (!box) return []
  return Array.from(box.querySelectorAll(SELECTORS.cellInBox))
}

/**
 * The "N replies" header cell, if it lives inside the reply box.
 *
 * It is the first cell without a floor number — picking the first cell blindly
 * would return the first reply and move it to the top when merging pages.
 */
export function findFirstCommentCell(doc: ParentNode): Element | null {
  const box = findCommentBox(doc)
  if (!box) return null
  const cells = Array.from(box.querySelectorAll(SELECTORS.firstCellInBox))
  return cells.find((cell) => cell.querySelector(SELECTORS.commentNumberSpan) === null) ?? null
}

export function getCommentElementsFromHtmlString(runtime: Runtime, htmlString: string): Element[] {
  const domParser = new runtime.DOMParser()
  const dom = domParser.parseFromString(htmlString, 'text/html')
  const cells = findCommentCells(dom)
  console.debug('[v2ex] getCommentElementsFromHtmlString', { count: cells.length })
  if (cells.length === 0) {
    const boxCount = dom.querySelectorAll(SELECTORS.mainBoxes).length
    const cellCount = dom.querySelectorAll(SELECTORS.mainCells).length
    console.debug('[v2ex] getCommentElementsFromHtmlString - no cells', { boxCount, cellCount })
  }
  return cells
}
