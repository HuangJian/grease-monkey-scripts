import type { Runtime } from '../runtime'
import type { AuthorTagMap } from '../shared/author-labels'
import {
  addTag,
  getTotalScore,
  incrementTagScore,
  parseAuthorTagMap,
  removeTag,
  tagColor,
} from '../shared/author-labels'
import {
  buildTagPanel,
  tagPanelCss,
  type TagPanelCallbacks,
  type QuickLabels,
} from '../shared/tag-panel'
import { htmlToElement, htmlToDocument } from '../utils'
import {
  buildPageUrl,
  extractEuid,
  extractNextData,
  findAllAuthorLinks,
  isAuthorNameLink,
  parseNextData,
  parseReplyList,
} from './selectors'

const STORAGE_KEY = 'hupu_author_tags'
const BTN_CLASS = 'gm-tag-btn'
const PROCESSED_CLASS = 'gm-processed'

export { STORAGE_KEY, BTN_CLASS, PROCESSED_CLASS }

const QUICK_LABELS: QuickLabels = {
  shame: { tag: '串子', display: '串子' },
  thank: { tag: '家人', display: '家人' },
}

export type HupuApp = Awaited<ReturnType<typeof createHupuApp>>

async function loadAuthorTagMap(runtime: Runtime): Promise<AuthorTagMap> {
  const value = await runtime.getValue<unknown>(STORAGE_KEY, {})
  return parseAuthorTagMap(value)
}

export async function createHupuApp(runtime: Runtime) {
  const authorTagMap = await loadAuthorTagMap(runtime)
  const euidToPuidMap = new Map<string, string>()

  function persist(): void {
    void runtime.setValue(STORAGE_KEY, authorTagMap)
  }

  function tagAuthor(id: string, commentNumber: number | string, tag: string, delta: number): void {
    const url = `https://my.hupu.com/${commentNumber}`
    incrementTagScore(authorTagMap, id, tag, url, delta)
    persist()
    applyHighlights()
  }

  function setTag(id: string, tag: string, score: number, commentNumber: number | string): void {
    const url = `https://my.hupu.com/${commentNumber}`
    addTag(authorTagMap, id, tag, url, score)
    persist()
    applyHighlights()
  }

  function unsetTag(id: string, tag: string): void {
    removeTag(authorTagMap, id, tag)
    persist()
    applyHighlights()
  }

  function clampScore(score: number): number {
    return Math.max(-3, Math.min(3, score))
  }

  function clearHighlights(): void {
    runtime.document.querySelectorAll('.gm-author-tag').forEach((el) => el.remove())
    for (let i = -3; i <= 3; i++) {
      const cls = `gm-highlight-${i < 0 ? `n${-i}` : i}`
      runtime.document.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls))
    }
  }

  function applyHighlights(): void {
    clearHighlights()
    for (const authorLink of findAllAuthorLinks(runtime.document.body)) {
      if (!isAuthorNameLink(authorLink)) continue
      const euid = extractEuid(authorLink.getAttribute('href') || '')
      if (!euid) continue
      const puid = euidToPuidMap.get(euid) || euid
      const tags = authorTagMap[puid]
      if (!tags) continue

      const total = getTotalScore(tags)
      for (const [tagName, record] of Object.entries(tags)) {
        const tagEl = htmlToElement(
          runtime.document,
          `<a class="gm-author-tag" href="${new URL(record.url, runtime.location.origin).href}" target="_blank"></a>`,
        )
        tagEl.textContent = tagName
        ;(tagEl as HTMLElement).style.color = tagColor(record.score)
        authorLink.insertAdjacentElement('afterend', tagEl)
      }

      const replyContent = authorLink
        .closest('.post-reply-list-container')
        ?.querySelector('.post-reply-list-content')
      if (replyContent) {
        const clamped = clampScore(total)
        if (clamped !== 0) {
          replyContent.classList.add(`gm-highlight-${clamped < 0 ? `n${-clamped}` : clamped}`)
        }
      }
    }
  }

  function attachTagButton(authorLink: Element, authorPuid: string, euid: string): void {
    authorLink.classList.add(PROCESSED_CLASS)
    const btn = htmlToElement(runtime.document, `<a class="${BTN_CLASS}" href="#;">🏷</a>`)
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const callbacks: TagPanelCallbacks = {
        onTagAuthor: (id, commentNum, tag, delta) => tagAuthor(id, commentNum, tag, delta),
        onSetTag: (id, tag, score, commentNum) => setTag(id, tag, score, commentNum),
        onUnsetTag: (id, tag) => unsetTag(id, tag),
      }
      buildTagPanel(runtime, authorTagMap, authorPuid, euid, btn, callbacks, QUICK_LABELS)
    })
    authorLink.insertAdjacentElement('afterend', btn)
  }

  function processElement(root: Node): void {
    for (const link of findAllAuthorLinks(root as Element)) {
      if (link.classList.contains(PROCESSED_CLASS)) continue
      if (!isAuthorNameLink(link)) continue
      const euid = extractEuid(link.getAttribute('href') || '')
      if (!euid) continue
      const puid = euidToPuidMap.get(euid) || euid
      attachTagButton(link, puid, euid)
    }
  }

  function setupObserver(): void {
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new runtime.MutationObserver((mutations) => {
      let found = false
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          const links = findAllAuthorLinks(node)
          for (const link of links) {
            if (!isAuthorNameLink(link)) continue
            if (link.classList.contains(PROCESSED_CLASS)) continue
            const euid = extractEuid(link.getAttribute('href') || '')
            if (!euid) continue
            const puid = euidToPuidMap.get(euid) || euid
            attachTagButton(link, puid, euid)
            found = true
          }
        }
      }
      if (found) applyHighlights()
    })
    observer.observe(runtime.document.body, { childList: true, subtree: true })

    if (timer === null) {
      timer = setTimeout(function scan() {
        processElement(runtime.document.body)
        applyHighlights()
        timer = setTimeout(scan, 3000)
      }, 2000)
    }
  }

  function loadAuthorMapFromOtherPages(tid: string, currentPage: number, totalPages: number): void {
    if (totalPages <= 1) return
    const otherPages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
      (p) => p !== currentPage,
    )
    for (const page of otherPages) {
      const url = buildPageUrl(tid, page)
      runtime.request({
        url,
        method: 'GET',
        timeout: 30000,
        onload(response) {
          const doc = htmlToDocument(response.responseText, new runtime.DOMParser())
          const json = extractNextData(doc)
          if (!json) return
          for (const reply of parseReplyList(json)) {
            euidToPuidMap.set(reply.authorEuid, reply.authorPuid)
          }
        },
        onerror: () => {},
        ontimeout: () => {},
      })
    }
  }

  function start(): void {
    runtime.addStyle(tagPanelCss)
    runtime.addStyle(`/*{{HUPU_TIME_SAVER_CSS}}*/`)

    const nextData = extractNextData(runtime.document)
    if (!nextData) return

    const threadData = parseNextData(nextData)
    if (!threadData) return

    euidToPuidMap.set(threadData.authorEuid, threadData.authorPuid)
    for (const reply of parseReplyList(nextData)) {
      euidToPuidMap.set(reply.authorEuid, reply.authorPuid)
    }

    processElement(runtime.document.body)
    applyHighlights()
    setupObserver()

    loadAuthorMapFromOtherPages(threadData.tid, threadData.currentPage, threadData.pageCount)
  }

  return {
    start,
    tagAuthor,
    setTag,
    unsetTag,
    getTags: (puid: string) => (authorTagMap[puid] ? { ...authorTagMap[puid] } : undefined),
    getScore: (puid: string) => getTotalScore(authorTagMap[puid]),
    getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)),
    applyHighlights: () => applyHighlights(),
    processElement: (root: Node) => processElement(root),
  }
}
