import type { Runtime } from '../runtime'
import type { AuthorTagMap } from './author-labels'
import {
  addTag,
  authorTagsKeyword,
  getTotalScore,
  incrementTagScore,
  parseAuthorTagMap,
  removeTag,
  toRelativeUrl,
} from './author-labels'
import { addCollapseExpandButtons, embedDiscussions } from './discussion-embedder'
import { getCommentElementsFromHtmlString } from './comment-helpers'
import { checkAndDoSignIn } from './sign-in'
import { COMMENT_BOX_SELECTOR, COMMENT_CELLS_SELECTOR } from './constants'
import { addTagPanel } from './tag-panel'
import {
  addTargetToTopicLinks,
  highlightCommentsAndTopics,
  reorderCommentsByHearts,
  scrollToComment,
} from './thread-enhancements'

export { authorTagsKeyword }

export type V2exApp = Awaited<ReturnType<typeof createV2exApp>>

export async function startV2exTimeSaver(runtime: Runtime): Promise<void> {
  const app = await createV2exApp(runtime)
  app.start()
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

  function enhanceThreadPage() {
    embedDiscussions(runtime)
    reorderCommentsByHearts(runtime)
    addCollapseExpandButtons(runtime)
    addTagPanel(runtime, authorTagMap, tagAuthor, setTag, unsetTag)
    highlightCommentsAndTopics(runtime, authorTagMap)
    addTargetToTopicLinks(runtime)
    scrollToCommentByHash()
  }

  let commentsOfPages: (NodeListOf<Element> | null)[] = []

  function tryDisplayAllComments() {
    const isAllPagesLoaded = commentsOfPages.every((page) => page !== null && page.length > 0)
    if (!isAllPagesLoaded) {
      return
    }

    const fragment = runtime.document.createDocumentFragment()
    commentsOfPages.forEach((pageComments) => {
      pageComments?.forEach((it) => fragment.appendChild(it))
    })

    const commentBox = runtime.document.querySelector(COMMENT_BOX_SELECTOR)
    const countsElement = commentBox?.querySelector('.cell')
    if (!commentBox || !countsElement) {
      return
    }

    commentBox.prepend(fragment)
    commentBox.prepend(countsElement)
    Array.from(runtime.document.querySelectorAll('.ps_container'))
      .filter((it, idx) => idx > 0)
      .forEach((it) => it.remove())
    enhanceThreadPage()
  }

  function loadCommentsByPage(page: number, idx: number) {
    const url = `${runtime.location.origin}${runtime.location.pathname}?p=${page}`
    runtime.request({
      url,
      method: 'GET',
      timeout: 30000,
      onload(response) {
        commentsOfPages[idx] = getCommentElementsFromHtmlString(runtime, response.responseText)
        tryDisplayAllComments()
      },
    })
  }

  function start() {
    const isReadingTopic = runtime.location.href.indexOf('v2ex.com/t/') > 0

    addStyles()
    checkAndDoSignIn(runtime)

    const allPageNumbers = Array.from(
      runtime.document.querySelectorAll('.page_current, .page_normal'),
    )
      .map((it) => parseInt(it.textContent || '', 10))
      .filter((it) => isReadingTopic && !isNaN(it) && it >= 1 && it <= 10)
      .filter((x, i, a) => a.indexOf(x) === i)
      .sort((a, b) => a - b)

    if (!allPageNumbers.length) {
      enhanceThreadPage()
      return
    }

    const currentPageEl = runtime.document.querySelector('.page_current')
    const currentPageNum = currentPageEl
      ? parseInt(currentPageEl.textContent || '', 10)
      : parseInt(new URL(runtime.location.href).searchParams.get('p') || '1', 10) || 1

    commentsOfPages = allPageNumbers.map(() => null)

    allPageNumbers.forEach((pageNum, idx) => {
      if (pageNum === currentPageNum) {
        commentsOfPages[idx] = runtime.document.querySelectorAll(COMMENT_CELLS_SELECTOR)
      } else {
        loadCommentsByPage(pageNum, idx)
      }
    })

    tryDisplayAllComments()
  }

  function addStyles() {
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
