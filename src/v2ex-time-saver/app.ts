import type { Runtime } from '../runtime'
import type { AuthorTagMap } from '../shared/author-labels'
import {
  addTag,
  getTotalScore,
  incrementTagScore,
  parseAuthorTagMap,
  removeTag,
  toRelativeUrl,
} from '../shared/author-labels'
import {
  buildTagPanel,
  tagPanelCss,
  type TagPanelCallbacks,
  type QuickLabels,
} from '../shared/tag-panel'

import { addCollapseExpandButtons, embedDiscussions } from './discussion-embedder'
import {
  findCommentBox,
  findCommentCells,
  findFirstCommentCell,
  getCommentElementsFromHtmlString,
} from './comment-helpers'
import { checkAndDoSignIn } from './sign-in'
import {
  addTargetToTopicLinks,
  highlightCommentsAndTopics,
  reorderCommentsByHearts,
  scrollToComment,
} from './thread-enhancements'
import { addWiseCommentNavigator } from './wise-comment-navigator'

export const authorTagsKeyword = 'author_tags'

export const defaultLabels = {
  shame: '若婴',
  thank: '智者',
} as const

export type V2exApp = Awaited<ReturnType<typeof createV2exApp>>

export async function startV2exTimeSaver(runtime: Runtime): Promise<void> {
  console.log('[v2ex] startV2exTimeSaver')
  try {
    const app = await createV2exApp(runtime)
    app.start()
    console.log('[v2ex] startV2exTimeSaver done')
  } catch (e) {
    console.error('[v2ex] startV2exTimeSaver error', e)
  }
}

async function loadAuthorTagMap(runtime: Runtime): Promise<AuthorTagMap> {
  const value = await runtime.getValue<unknown>(authorTagsKeyword, {})
  return parseAuthorTagMap(value)
}

export async function createV2exApp(runtime: Runtime) {
  const authorTagMap = await loadAuthorTagMap(runtime)

  function buildAuthorUrl(commentNumber: number | string): string {
    return `${runtime.location.origin}${runtime.location.pathname}#${commentNumber}`
  }

  function getRelativeAuthorUrl(commentNumber: number | string): string {
    return toRelativeUrl(buildAuthorUrl(commentNumber))
  }

  function persist(): void {
    void runtime.setValue(authorTagsKeyword, authorTagMap)
  }

  function tagAuthor(id: string, commentNumber: number | string, tag: string, delta: number): void {
    const url = getRelativeAuthorUrl(commentNumber)
    incrementTagScore(authorTagMap, id, tag, url, delta)
    persist()
    highlightCommentsAndTopics(runtime, authorTagMap)
  }

  function setTag(id: string, tag: string, score: number, commentNumber: number | string): void {
    const url = getRelativeAuthorUrl(commentNumber)
    addTag(authorTagMap, id, tag, url, score)
    persist()
    highlightCommentsAndTopics(runtime, authorTagMap)
  }

  function unsetTag(id: string, tag: string): void {
    removeTag(authorTagMap, id, tag)
    persist()
    highlightCommentsAndTopics(runtime, authorTagMap)
  }

  function scrollToCommentByHash(): void {
    const hash = runtime.location.hash
    if (!/^#\d+$/.test(hash)) return
    scrollToComment(hash.slice(1), runtime)
  }

  // --- tag panel ---

  const callbacks: TagPanelCallbacks = {
    onTagAuthor: tagAuthor,
    onSetTag: setTag,
    onUnsetTag: unsetTag,
  }
  const quickLabels: QuickLabels = {
    shame: { tag: defaultLabels.shame, display: '不说人话' },
    thank: { tag: defaultLabels.thank, display: defaultLabels.thank },
  }
  const btnClass = 'gm-tag-btn'

  function ensureTagBtn(
    container: Element,
    id: string,
    commentNumber: number | string,
    ref: Element | null,
  ): void {
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

  function addTagPanel(): void {
    const topicAuthorId = runtime.document.querySelector('.header .avatar')?.getAttribute('alt')
    if (topicAuthorId) {
      const topicButtons = runtime.document.querySelector('.topic_buttons')
      if (topicButtons) {
        ensureTagBtn(topicButtons, topicAuthorId, 0, null)
      }
    }

    runtime.document.querySelectorAll('.cell').forEach((cell) => {
      const authorLink = cell.querySelector('strong > a[href]')
      if (!authorLink) return
      const id = authorLink.getAttribute('href')?.split('/')[2]
      if (!id) return
      const commentNumber = cell.querySelector('span.no')?.textContent?.trim()
      if (!commentNumber) return
      ensureTagBtn(cell, id, commentNumber, authorLink)
    })
  }

  // ---

  function enhanceThreadPage() {
    console.log('[v2ex] enhanceThreadPage start')
    embedDiscussions(runtime)
    reorderCommentsByHearts(runtime)
    addCollapseExpandButtons(runtime)
    addTagPanel()
    highlightCommentsAndTopics(runtime, authorTagMap)
    addWiseCommentNavigator(runtime, authorTagMap)
    addTargetToTopicLinks(runtime)
    scrollToCommentByHash()
    console.log('[v2ex] enhanceThreadPage done')
  }

  let commentsOfPages: (NodeListOf<Element> | null)[] = []

  function tryDisplayAllComments() {
    const states = commentsOfPages.map((p) => (p ? `non-null(len=${p.length})` : 'null'))
    console.log('[v2ex] tryDisplayAllComments', { states })

    const isAllPagesLoaded = commentsOfPages.every((page) => page !== null && page.length > 0)
    if (!isAllPagesLoaded) {
      console.log('[v2ex] not all pages loaded yet, bail')
      return
    }

    const commentBox = findCommentBox(runtime.document)
    const countsElement = findFirstCommentCell(runtime.document)
    console.log('[v2ex] tryDisplayAllComments', {
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
    console.log('[v2ex] all pages merged, calling enhanceThreadPage')
    enhanceThreadPage()
  }

  function loadCommentsByPage(page: number, idx: number) {
    const url = `${runtime.location.origin}${runtime.location.pathname}?p=${page}`
    console.log('[v2ex] fetch page', { page, idx, url })
    runtime.request({
      url,
      method: 'GET',
      timeout: 30000,
      onload(response) {
        const cells = getCommentElementsFromHtmlString(runtime, response.responseText)
        console.log('[v2ex] fetched page comments', { page, idx, count: cells.length })
        commentsOfPages[idx] = cells
        tryDisplayAllComments()
      },
    })
  }

  function start() {
    const isReadingTopic = runtime.location.href.indexOf('v2ex.com/t/') > 0
    console.log('[v2ex] start', { isReadingTopic, url: runtime.location.href })

    addStyles()
    checkAndDoSignIn(runtime)

    const allPageNumbers = Array.from(
      runtime.document.querySelectorAll('.page_current, .page_normal'),
    )
      .map((it) => parseInt(it.textContent || '', 10))
      .filter((it) => isReadingTopic && !isNaN(it) && it >= 1 && it <= 10)
      .filter((x, i, a) => a.indexOf(x) === i)
      .sort((a, b) => a - b)

    console.log('[v2ex] pageNumbers', allPageNumbers)

    if (!allPageNumbers.length) {
      console.log('[v2ex] single page — enhanceThreadPage')
      enhanceThreadPage()
      return
    }

    const currentPageEl = runtime.document.querySelector('.page_current')
    const currentPageNum = currentPageEl
      ? parseInt(currentPageEl.textContent || '', 10)
      : parseInt(new URL(runtime.location.href).searchParams.get('p') || '1', 10) || 1

    console.log('[v2ex] multi-page', { currentPageNum, allPageNumbers })

    commentsOfPages = allPageNumbers.map(() => null)

    allPageNumbers.forEach((pageNum, idx) => {
      if (pageNum === currentPageNum) {
        const cells = findCommentCells(runtime.document)
        console.log('[v2ex] current page cells', { pageNum, count: cells.length })
        commentsOfPages[idx] = cells as unknown as NodeListOf<Element>
      } else {
        loadCommentsByPage(pageNum, idx)
      }
    })

    tryDisplayAllComments()
  }

  function addStyles() {
    runtime.addStyle(tagPanelCss)
    runtime.addStyle(`/*{{V2EX_TIME_SAVER_CSS}}*/`)
  }

  return {
    addTargetToTopicLinks,
    embedDiscussions,
    getCommentElementsFromHtmlString: (html: string) =>
      getCommentElementsFromHtmlString(runtime, html),
    highlightCommentsAndTopics: () => highlightCommentsAndTopics(runtime, authorTagMap),
    tagAuthor,
    setTag,
    unsetTag,
    getTags: (id: string) => (authorTagMap[id] ? { ...authorTagMap[id] } : undefined),
    getScore: (id: string) => getTotalScore(authorTagMap[id]),
    getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)),
    reorderCommentsByHearts,
    start,
  }
}
