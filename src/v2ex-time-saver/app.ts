import type { AuthorMap, Runtime } from './types'
import { defaultLabels, getAuthorLabel } from './author-labels'
import { addCollapseExpandButtons, embedDiscussions } from './discussion-embedder'
import { getCommentElementsFromHtmlString } from './comment-helpers'
import {
  addMoreThankActions,
  addShameButtons,
  addTargetToTopicLinks,
  highlightCommentsAndTopics,
  reorderCommentsByHearts,
} from './thread-enhancements'
import { checkAndDoSignIn } from './sign-in'
import { COMMENT_BOX_SELECTOR, COMMENT_CELLS_SELECTOR } from './constants'

function parseAuthorMap(value: string | null): AuthorMap {
  if (!value) {
    return new Map()
  }
  return new Map(JSON.parse(value))
}

export const shameKeyword = 'shame_on_them'
export const thankKeyword = 'thanks_to_them'

export type V2exApp = Awaited<ReturnType<typeof createV2exApp>>

export async function startV2exTimeSaver(runtime: Runtime): Promise<void> {
  const app = await createV2exApp(runtime)
  app.start()
}

export async function createV2exApp(runtime: Runtime) {
  const [shamedMap, thankedMap] = (
    await Promise.all([shameKeyword, thankKeyword].map(async (key) => runtime.getValue(key, '[]')))
  ).map((value) => parseAuthorMap(value))

  function likeDislikeAuthorWrapper(id: string, commentNumber: number | string, isLike: boolean) {
    const url = `${runtime.location.origin}${runtime.location.pathname}#${commentNumber}`
    const map = isLike ? thankedMap : shamedMap
    const keyword = isLike ? thankKeyword : shameKeyword
    const fallbackLabel = isLike ? defaultLabels.thank : defaultLabels.shame
    const currentLabel = getAuthorLabel(map, id, fallbackLabel)
    const actionName = isLike ? '感谢' : '标记'
    const label = runtime.prompt(`请输入给作者 ${id} 的${actionName}标签：`, currentLabel)

    if (label === null) {
      return
    }

    map.set(id, {
      url,
      label: label.trim() || fallbackLabel,
    })
    void runtime.setValue(keyword, JSON.stringify(Array.from(map)))
    highlightCommentsAndTopics(runtime, shamedMap, thankedMap)
  }

  function enhanceThreadPage() {
    embedDiscussions(runtime)
    reorderCommentsByHearts(runtime)
    addCollapseExpandButtons(runtime)
    addShameButtons(runtime, likeDislikeAuthorWrapper)
    addMoreThankActions(runtime, likeDislikeAuthorWrapper)
    highlightCommentsAndTopics(runtime, shamedMap, thankedMap)
    addTargetToTopicLinks(runtime)
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
    highlightCommentsAndTopics: () => highlightCommentsAndTopics(runtime, shamedMap, thankedMap),
    likeDislikeAuthor: likeDislikeAuthorWrapper,
    reorderCommentsByHearts,
    start,
  }
}
