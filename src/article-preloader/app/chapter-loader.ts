import type { Runtime } from '../../runtime'
import type { Selectors } from '../selectors'
import { htmlToDocument, toAbsoluteUrl } from '../../utils'
import { findChapterLink } from '../selectors'
import { fetchPage } from './request'

export type ChapterResult = {
  html: string
  url: string
  nextChapterUrl: string
}

export function isEndOfStory(nextUrl: string, selectors: Selectors, baseUrl: string): boolean {
  const indexLink = selectors.indexLinkSelector()
  const indexUrl = indexLink ? indexLink.getAttribute('href') || '' : ''
  return (
    !!indexUrl &&
    toAbsoluteUrl(nextUrl, baseUrl).replace(/#.*/, '') ===
      toAbsoluteUrl(indexUrl, baseUrl).replace(/#.*/, '')
  )
}

export function buildResult(
  chapterDoc: Document,
  chapterUrl: string,
  currentDoc: Document,
  selectors: Selectors,
): ChapterResult {
  const nextChapterLink = findChapterLink(
    selectors.paginationSelector,
    [selectors.matchNextChapterText],
    currentDoc,
  )
  const nextChapterUrl = toAbsoluteUrl(nextChapterLink?.getAttribute('href') ?? null, chapterUrl)

  if (nextChapterUrl) {
    const firstPageNextLink = findChapterLink(
      selectors.paginationSelector,
      [selectors.matchNextChapterText],
      chapterDoc,
    )
    if (!firstPageNextLink) {
      const continuationLink = findChapterLink(
        selectors.paginationSelector,
        [selectors.matchContinuationText],
        chapterDoc,
      )
      if (continuationLink) {
        continuationLink.textContent = '下一章'
        continuationLink.setAttribute('href', nextChapterUrl)
      }
    }
  }

  return {
    html: '<!DOCTYPE html>\n' + chapterDoc.documentElement.outerHTML,
    url: chapterUrl,
    nextChapterUrl,
  }
}

export function appendNextPage(
  runtime: Runtime,
  selectors: Selectors,
  chapterDoc: Document,
  chapterUrl: string,
  chapterContent: Element,
  visited: Set<string>,
  currentDoc: Document,
  onSuccess: (result: ChapterResult) => void,
  onFailure: () => void,
) {
  const nextPageLink = findChapterLink(
    selectors.paginationSelector,
    [selectors.matchContinuationText],
    currentDoc,
  )

  if (!nextPageLink || visited.has(toAbsoluteUrl(nextPageLink.getAttribute('href'), chapterUrl))) {
    onSuccess(buildResult(chapterDoc, chapterUrl, currentDoc, selectors))
    return
  }

  const nextPageUrl = toAbsoluteUrl(nextPageLink.getAttribute('href'), chapterUrl)
  visited.add(nextPageUrl)

  fetchPage(
    runtime,
    nextPageUrl,
    ({ html, status }) => {
      const nextDoc = htmlToDocument(html, new runtime.DOMParser())
      const nextContent = nextDoc.querySelector(selectors.contentSelector || '')

      if (!nextContent) {
        if (status === 200) {
          onSuccess(buildResult(chapterDoc, chapterUrl, currentDoc, selectors))
          return
        }
        onFailure()
        return
      }

      chapterContent.append(
        ...Array.from(nextContent.childNodes).map((node) => chapterDoc.importNode(node, true)),
      )
      appendNextPage(
        runtime,
        selectors,
        chapterDoc,
        chapterUrl,
        chapterContent,
        visited,
        nextDoc,
        onSuccess,
        onFailure,
      )
    },
    onFailure,
  )
}

export function loadChapter(
  runtime: Runtime,
  selectors: Selectors,
  url: string,
  onSuccess: (result: ChapterResult) => void,
  onFailure: () => void,
) {
  fetchPage(
    runtime,
    url,
    ({ html, status }) => {
      const chapterUrl = toAbsoluteUrl(url, runtime.location.href)
      const chapterDoc = htmlToDocument(html, new runtime.DOMParser())
      const chapterContent = chapterDoc.querySelector(selectors.contentSelector || '')

      if (!chapterContent) {
        if (status === 200) return
        onFailure()
        return
      }

      const visited = new Set([chapterUrl])
      appendNextPage(
        runtime,
        selectors,
        chapterDoc,
        chapterUrl,
        chapterContent,
        visited,
        chapterDoc,
        onSuccess,
        onFailure,
      )
    },
    onFailure,
  )
}
