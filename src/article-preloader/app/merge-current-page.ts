import type { Runtime } from '../../runtime'
import type { Selectors } from '../types'
import { findChapterLink } from '../selectors'
import { htmlToDocument, getLinkText, toAbsoluteUrl } from '../../utils'
import { isEndOfStory } from './chapter-loader'
import { fetchPage } from './request'

/**
 * Nodes that must never be copied into the live page.
 *
 * Some sites (the sudugu family) ship the text of pages 2+ inside an external
 * script that calls `document.write(...)`. Copying that script into the live
 * document runs it after load, and `document.write` on a closed document calls
 * `document.open()` — wiping the whole page, merged content included.
 */
const EXECUTABLE_NODES = 'script, iframe, noscript, object, embed, style'

const DOC_WRITE_RE = /document\.write\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g

const ELEMENT_NODE = 1

function isElement(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE
}

/** The container's children minus anything executable. */
function copyableNodes(content: Element): Node[] {
  return Array.from(content.childNodes).filter(
    (node) => !isElement(node) || !node.matches(EXECUTABLE_NODES),
  )
}

function hasVisibleText(nodes: Node[]): boolean {
  return nodes.some((node) => (node.textContent ?? '').trim() !== '')
}

/** Markup a script would have written, for sites that inject text via `document.write`. */
function writtenMarkup(js: string): string {
  const parts: string[] = []
  for (const match of js.matchAll(DOC_WRITE_RE)) {
    parts.push(match[1]!.replace(/\\(.)/gs, '$1'))
  }
  return parts.join('')
}

function fetchText(runtime: Runtime, url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    fetchPage(
      runtime,
      url,
      ({ html }) => resolve(html),
      () => reject(new Error(`fetch failed: ${url}`)),
    )
  })
}

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
  const target: Element = currentContent

  function appendNodes(nodes: Node[]) {
    target.append(...nodes.map((node) => runtime.document.importNode(node, true)))
  }

  function nodesFromMarkup(markup: string): Node[] {
    if (!markup) return []
    const holder = htmlToDocument(
      `<div id="gm-merge-target">${markup}</div>`,
      new runtime.DOMParser(),
    ).querySelector('#gm-merge-target')
    return holder ? copyableNodes(holder) : []
  }

  function finish(doc: Document) {
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
  }

  /**
   * A page whose container holds no prose delivers it through an injection
   * script. Fetch those scripts and take the markup they would have written —
   * executing them in the live page would wipe it instead.
   */
  async function recoverInjectedText(nextDoc: Document, baseUrl: string): Promise<void> {
    const nextContent = nextDoc.querySelector(contentSelector)
    if (!nextContent) {
      done()
      return
    }
    const markup: string[] = []
    for (const script of Array.from(nextContent.querySelectorAll('script[src]'))) {
      const src = script.getAttribute('src')
      if (!src) continue
      try {
        markup.push(writtenMarkup(await fetchText(runtime, toAbsoluteUrl(src, baseUrl))))
      } catch {
        // Unreachable injection script: nothing to recover from this one.
      }
    }
    appendNodes(nodesFromMarkup(markup.join('')))
    fetchNextPages(nextDoc)
  }

  function fetchNextPages(doc: Document): void {
    const nextLink = findChapterLink(
      selectors.paginationSelector,
      [selectors.matchContinuationText],
      doc,
    )
    const nextHref = nextLink?.getAttribute('href')
    if (!nextLink || !nextHref) {
      finish(doc)
      return
    }

    const nextPageUrl = toAbsoluteUrl(nextHref, currentUrl)
    if (visited.has(nextPageUrl)) {
      finish(doc)
      return
    }
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

        const nodes = copyableNodes(nextContent)
        if (hasVisibleText(nodes)) {
          appendNodes(nodes)
          fetchNextPages(nextDoc)
          return
        }
        void recoverInjectedText(nextDoc, nextPageUrl)
      },
      () => done(),
    )
  }

  const visited = new Set([currentUrl])
  fetchNextPages(runtime.document)
}
