import type { Runtime } from '../../runtime'
import type { Selectors } from '../selectors'
import { isEndOfStory } from './chapter-loader'
import { wireKeyboardNav } from './keyboard'
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

  function displayNextChapter() {
    retry = 0
    runtime.document.documentElement.innerHTML = nextChapterContent
    runtime.document.defaultView?.history.pushState(null, '', nextChapterUrl)
    runtime.document.defaultView?.scrollTo(0, 0)

    const nextLink = selectors.nextChapterLinkSelector()
    if (nextLink && isEndOfStory(nextLink.getAttribute('href') || '', selectors, nextChapterUrl)) {
      nextLink.textContent = '今日文尽'
    }

    preloadNextChapter()
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
    loadChapter(
      nextChapterUrl,
      ({ html, url }) => {
        nextChapterContent = html
        nextChapterUrl = url
        const linkText = isEndOfStory(nextChapterUrl, selectors, runtime.location.href)
          ? '今日文尽'
          : '下一章'
        nextChapterLink.insertAdjacentHTML('afterend', `<a style="cursor: pointer">${linkText}</a>`)
        const newLink = nextChapterLink.nextElementSibling as HTMLElement
        newLink.addEventListener('click', () => displayNextChapter())
        nextChapterLink.replaceWith(newLink)
        wireKeyboardNav(runtime.document, selectors, () => displayNextChapter())
      },
      () => preloadNextChapter(),
    )
  }

  return { preloadNextChapter }
}
