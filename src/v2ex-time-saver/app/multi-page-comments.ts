import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import {
  findCommentBox,
  findCommentCells,
  findFirstCommentCell,
  getCommentElementsFromHtmlString,
} from './comment-helpers'
import type { TagPanelCallbacks, QuickLabels } from '../../shared/tag-panel'
import { enhanceThreadPage } from './thread-page'

export function createMultiPageLoader(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  callbacks: TagPanelCallbacks,
  quickLabels: QuickLabels,
) {
  let commentsOfPages: (NodeListOf<Element> | null)[] = []

  function tryDisplayAllComments() {
    const states = commentsOfPages.map((p) => (p ? `non-null(len=${p.length})` : 'null'))
    console.debug('[gm-v2ex-time-saver] tryDisplayAllComments', { states })

    const isAllPagesLoaded = commentsOfPages.every((page) => page !== null && page.length > 0)
    if (!isAllPagesLoaded) {
      console.debug('[gm-v2ex-time-saver] not all pages loaded yet, bail')
      return
    }

    const commentBox = findCommentBox(runtime.document)
    const countsElement = findFirstCommentCell(runtime.document)
    console.debug('[gm-v2ex-time-saver] tryDisplayAllComments', {
      commentBox: !!commentBox,
      countsElement: !!countsElement,
      totalPages: commentsOfPages.length,
    })

    if (!commentBox || !countsElement) {
      return
    }

    const fragment = runtime.document.createDocumentFragment()
    commentsOfPages.forEach((pageComments) => {
      pageComments?.forEach((it) => {
        fragment.appendChild(it)
      })
    })

    commentBox.prepend(fragment)
    commentBox.prepend(countsElement)
    Array.from(runtime.document.querySelectorAll('.ps_container'))
      .filter((it, idx) => idx > 0)
      .forEach((it) => it.remove())
    console.debug('[gm-v2ex-time-saver] all pages merged, calling enhanceThreadPage')
    enhanceThreadPage(runtime, authorTagMap, callbacks, quickLabels)
  }

  function loadCommentsByPage(page: number, idx: number) {
    const url = `${runtime.location.origin}${runtime.location.pathname}?p=${page}`
    console.debug('[gm-v2ex-time-saver] fetch page', { page, idx, url })
    runtime.request({
      url,
      method: 'GET',
      timeout: 30000,
      onload(response) {
        const cells = getCommentElementsFromHtmlString(runtime, response.responseText)
        console.debug('[gm-v2ex-time-saver] fetched page comments', {
          page,
          idx,
          count: cells.length,
        })
        commentsOfPages[idx] = cells
        tryDisplayAllComments()
      },
    })
  }

  function loadAllPages(allPageNumbers: number[], currentPageNum: number) {
    commentsOfPages = allPageNumbers.map(() => null)

    allPageNumbers.forEach((pageNum, idx) => {
      if (pageNum === currentPageNum) {
        const cells = findCommentCells(runtime.document)
        console.debug('[gm-v2ex-time-saver] current page cells', { pageNum, count: cells.length })
        commentsOfPages[idx] = cells as unknown as NodeListOf<Element>
      } else {
        loadCommentsByPage(pageNum, idx)
      }
    })

    tryDisplayAllComments()
  }

  return { loadAllPages }
}
