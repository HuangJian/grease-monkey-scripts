import type { Runtime } from '../../runtime'
import type { Selectors } from '../types'
import { isEndOfStory } from './chapter-loader'
import type { ChapterResult } from './chapter-loader'

export function createPreloadController(
  runtime: Runtime,
  selectors: Selectors,
  loadChapter: (
    url: string,
    onSuccess: (result: ChapterResult) => void,
    onFailure: () => void,
  ) => void,
) {
  let retry = 0
  let nextChapterContent = ''
  let nextChapterUrl = ''
  /** ArrowRight pressed while the next chapter was still loading. */
  let pendingAdvance = false

  function displayNextChapter() {
    retry = 0
    // A second arrow press before the preload lands used to write '' into
    // documentElement and wipe the whole page. Never display without content.
    if (!nextChapterContent) return
    const url = nextChapterUrl
    runtime.document.documentElement.innerHTML = nextChapterContent
    runtime.document.defaultView?.history.pushState(null, '', url)
    runtime.document.defaultView?.scrollTo(0, 0)

    const nextLink = selectors.nextChapterLinkSelector()
    if (nextLink && isEndOfStory(nextLink.getAttribute('href') || '', selectors, url)) {
      nextLink.textContent = '今日文尽'
    }

    preloadNextChapter()
  }

  /** Advance now when ready; otherwise remember exactly one press for later. */
  function requestNextChapter() {
    if (nextChapterContent) displayNextChapter()
    else pendingAdvance = true
  }

  function preloadNextChapter() {
    ++retry
    if (retry > 10) {
      console.error('预加载下一章内容失败：重试 10 次仍未成功，结束重试！')
      return
    }

    const nextChapterLink = selectors.nextChapterLinkSelector()
    if (!nextChapterLink) return

    nextChapterUrl = nextChapterLink.getAttribute('href') || ''
    nextChapterContent = ''
    // If the page advances or navigates while this fetch is in flight, its
    // result is stale and the link captured above is already detached.
    const expectedUrl = runtime.location.href
    loadChapter(
      nextChapterUrl,
      ({ html, url }) => {
        if (runtime.location.href !== expectedUrl) return
        nextChapterContent = html
        nextChapterUrl = url

        // Re-query: the original node may be detached if a display happened
        // while the chapter (and all its continuation pages) was loading.
        const currentLink = selectors.nextChapterLinkSelector()
        if (!currentLink) return
        const linkText = isEndOfStory(nextChapterUrl, selectors, runtime.location.href)
          ? '今日文尽'
          : '下一章'
        const newLink = runtime.document.createElement('a')
        newLink.setAttribute('style', 'cursor: pointer')
        newLink.textContent = linkText
        newLink.addEventListener('click', () => requestNextChapter())
        currentLink.insertAdjacentElement('afterend', newLink)
        currentLink.replaceWith(newLink)

        if (pendingAdvance) {
          pendingAdvance = false
          displayNextChapter()
        }
      },
      () => preloadNextChapter(),
    )
  }

  return { preloadNextChapter, requestNextChapter }
}
