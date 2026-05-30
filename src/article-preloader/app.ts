import type { Runtime } from '../runtime'
import { htmlToElement, htmlToDocument, getLinkText, toAbsoluteUrl } from '../utils'
import type { Selectors } from './selectors'
import { findChapterLink, selectorsFactory } from './selectors'

export { findChapterLink, selectorsFactory } from './selectors'

type ChapterResult = {
  html: string
  url: string
  nextChapterUrl: string
}

function fetchPage(
  runtime: Runtime,
  url: string,
  onSuccess: (result: { html: string; status: number }) => void,
  onFailure: () => void,
) {
  runtime.request({
    url: toAbsoluteUrl(url, runtime.location.href),
    method: 'GET',
    timeout: 120000,
    onload: (response) =>
      onSuccess({ html: response.responseText, status: response.status ?? 200 }),
    onerror: onFailure,
    ontimeout: onFailure,
  })
}

function buildResult(
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

function appendNextPage(
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

export function startArticlePreloader(runtime: Runtime) {
  let retry = 0
  let nextChapterContent = ''
  let nextChapterUrl = ''

  const selectors = selectorsFactory(runtime.location.host, runtime.document)

  function loadChapter(
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

  function mergeCurrentChapterIfNeeded(done: () => void) {
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
            link.textContent = '下一章'
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

  function displayNextChapter() {
    retry = 0
    runtime.document.documentElement.innerHTML = nextChapterContent
    runtime.document.defaultView?.history.pushState(null, '', nextChapterUrl)
    runtime.document.defaultView?.scrollTo(0, 0)
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
        const newLink = htmlToElement(runtime.document, '<a style="cursor: pointer">下一章</a>')
        if (newLink) {
          newLink.addEventListener('click', () => displayNextChapter())
          nextChapterLink.replaceWith(newLink)
        }
        runtime.document.onkeydown = (evt) => {
          if (evt.key === 'ArrowLeft') {
            const prev = selectors.previousChapterLinkSelector()
            if (prev) runtime.document.location.href = prev.getAttribute('href') || ''
          }
          if (evt.key === 'Enter') {
            const index = selectors.indexLinkSelector()
            if (index) runtime.document.location.href = index.getAttribute('href') || ''
          }
          if (evt.key === 'ArrowRight') displayNextChapter()
          evt.stopPropagation()
        }
      },
      () => preloadNextChapter(),
    )
  }

  mergeCurrentChapterIfNeeded(() => preloadNextChapter())

  return {
    loadChapter,
    mergeCurrentChapterIfNeeded,
    get selectors() {
      return selectors
    },
  }
}
