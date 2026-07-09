import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import {
  addTag,
  getTotalScore,
  incrementTagScore,
  parseAuthorTagMap,
  removeTag,
  HUPU_AUTHOR_TAGS_LS_KEY,
} from '../../shared/author-labels'
import type { QuickLabels } from '../../shared/tag-panel'
import { htmlToDocument } from '../../utils'
import { buildPageUrl, extractNextData, parseNextData, parseReplyList } from '../selectors'
import { applyHighlights } from './highlight'
import { processMedia } from './media'
import { setupObserver } from './observer'
import { processElement } from './tag-buttons'
import type { HupuApp } from '../types'

export type { HupuApp }

const STORAGE_KEY = 'hupu_author_tags'

export { STORAGE_KEY }

const QUICK_LABELS: QuickLabels = {
  shame: { tag: '串子', display: '串子' },
  thank: { tag: '家人', display: '家人' },
}

async function loadAuthorTagMap(runtime: Runtime): Promise<AuthorTagMap> {
  const value = await runtime.getValue<unknown>(STORAGE_KEY, {})
  return parseAuthorTagMap(value)
}

export async function createHupuApp(runtime: Runtime): Promise<HupuApp> {
  const authorTagMap = await loadAuthorTagMap(runtime)
  const euidToPuidMap = new Map<string, string>()
  let disconnectObserver: (() => void) | null = null

  function persist(): void {
    void runtime.setValue(STORAGE_KEY, authorTagMap)
    try {
      runtime.localStorage.setItem(HUPU_AUTHOR_TAGS_LS_KEY, JSON.stringify(authorTagMap))
    } catch {
      /* localStorage may be unavailable */
    }
  }

  function tagAuthor(id: string, commentNumber: number | string, tag: string, delta: number): void {
    const url = `https://my.hupu.com/${commentNumber}`
    incrementTagScore(authorTagMap, id, tag, url, delta)
    persist()
    applyHighlights(runtime, authorTagMap, euidToPuidMap)
  }

  function setTag(id: string, tag: string, score: number, commentNumber: number | string): void {
    const url = `https://my.hupu.com/${commentNumber}`
    addTag(authorTagMap, id, tag, url, score)
    persist()
    applyHighlights(runtime, authorTagMap, euidToPuidMap)
  }

  function unsetTag(id: string, tag: string): void {
    removeTag(authorTagMap, id, tag)
    persist()
    applyHighlights(runtime, authorTagMap, euidToPuidMap)
  }

  function start(): void {
    disconnectObserver = setupObserver(
      runtime,
      authorTagMap,
      euidToPuidMap,
      tagAuthor,
      setTag,
      unsetTag,
      QUICK_LABELS,
    )

    const nextData = extractNextData(runtime.document)
    if (!nextData) return

    const threadData = parseNextData(nextData)
    if (!threadData) return

    euidToPuidMap.set(threadData.authorEuid, threadData.authorPuid)
    for (const reply of parseReplyList(nextData)) {
      euidToPuidMap.set(reply.authorEuid, reply.authorPuid)
    }

    processElement(
      runtime,
      authorTagMap,
      euidToPuidMap,
      tagAuthor,
      setTag,
      unsetTag,
      QUICK_LABELS,
      runtime.document.body,
    )
    applyHighlights(runtime, authorTagMap, euidToPuidMap)

    loadAuthorMapFromOtherPages(threadData.tid, threadData.currentPage, threadData.pageCount)

    const scanMedia = () => processMedia(runtime.document.body)
    if (runtime.document.readyState === 'complete') {
      scanMedia()
    } else {
      runtime.document.defaultView?.addEventListener('load', scanMedia, { once: true })
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

  return {
    start,
    stop: () => disconnectObserver?.(),
    tagAuthor,
    setTag,
    unsetTag,
    getTags: (puid: string) => (authorTagMap[puid] ? { ...authorTagMap[puid] } : undefined),
    getScore: (puid: string) => getTotalScore(authorTagMap[puid]),
    getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)),
    applyHighlights: () => applyHighlights(runtime, authorTagMap, euidToPuidMap),
    processElement: (root: Node) =>
      processElement(
        runtime,
        authorTagMap,
        euidToPuidMap,
        tagAuthor,
        setTag,
        unsetTag,
        QUICK_LABELS,
        root,
      ),
  }
}
