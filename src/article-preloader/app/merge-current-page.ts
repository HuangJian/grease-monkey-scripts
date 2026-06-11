import type { Runtime } from '../../runtime'
import type { Selectors } from '../selectors'
import { findChapterLink } from '../selectors'
import { htmlToDocument, getLinkText, toAbsoluteUrl } from '../../utils'
import { isEndOfStory } from './chapter-loader'
import { fetchPage } from './request'

export function mergeCurrentChapterIfNeeded(
  runtime: Runtime,
  selectors: Selectors,
  done: () => void,
) {
  const links = Array.from(runtime.document.querySelectorAll(selectors.paginationSelector))
  const continuationLink =
    links.find((link) => selectors.matchContinuationText(getLinkText(link))) || null

  if (!continuationLink) {
    done()
    return
  }

  const currentUrl = runtime.location.href
  const contentSelector = selectors.contentSelector || ''
  const currentContent = runtime.document.querySelector(contentSelector)
  if (!currentContent) {
    done()
    return
  }

  const visited = new Set([currentUrl])

  function fetchNextPages(doc: Document) {
    const nextLink = findChapterLink(
      selectors.paginationSelector,
      [selectors.matchContinuationText],
      doc,
    )

    if (!nextLink || visited.has(toAbsoluteUrl(nextLink.getAttribute('href'), currentUrl))) {
      const nextChapterLink = findChapterLink(
        selectors.paginationSelector,
        [selectors.matchNextChapterText],
        doc,
      )
      const nextUrl = nextChapterLink
        ? toAbsoluteUrl(nextChapterLink.getAttribute('href'), currentUrl)
        : ''

      if (nextUrl) {
        const link = selectors.nextChapterLinkSelector()
        if (link) {
          link.setAttribute('href', nextUrl)
          link.textContent = isEndOfStory(nextUrl, selectors, currentUrl) ? '今日文尽' : '下一章'
        }
      }

      runtime.document.defaultView?.history.replaceState(null, '', currentUrl)
      done()
      return
    }

    const nextPageUrl = toAbsoluteUrl(nextLink.getAttribute('href')!, currentUrl)
    visited.add(nextPageUrl)

    fetchPage(
      runtime,
      nextPageUrl,
      ({ html }) => {
        const nextDoc = htmlToDocument(html, new runtime.DOMParser())
        const nextContent = nextDoc.querySelector(contentSelector)
        if (!nextContent) {
          done()
          return
        }
        currentContent!.append(
          ...Array.from(nextContent.childNodes).map((node) =>
            runtime.document.importNode(node, true),
          ),
        )
        fetchNextPages(nextDoc)
      },
      () => done(),
    )
  }

  fetchNextPages(runtime.document)
}
