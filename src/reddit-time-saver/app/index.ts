import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import {
  addTag,
  incrementTagScore,
  parseAuthorTagMap,
  removeTag,
  REDDIT_AUTHOR_TAGS_LS_KEY,
} from '../../shared/author-labels'
import { tagPanelCss } from '../../shared/tag-panel'
import { applyHighlights } from './highlight'
import { setupObserver } from './observer'
import { processElement } from './tag-buttons'
import type { RedditApp } from '../types'

export type { RedditApp }

export const STORAGE_KEY = 'reddit_author_tags'

const BTN_CLASS = 'gm-tag-btn'
const PROCESSED_CLASS = 'gm-processed'

export { BTN_CLASS, PROCESSED_CLASS }

async function loadAuthorTagMap(runtime: Runtime): Promise<AuthorTagMap> {
  const value = await runtime.getValue<unknown>(STORAGE_KEY, {})
  return parseAuthorTagMap(value)
}

export async function createRedditApp(runtime: Runtime): Promise<RedditApp> {
  const authorTagMap = await loadAuthorTagMap(runtime)

  function persist(): void {
    void runtime.setValue(STORAGE_KEY, authorTagMap)
    try {
      localStorage.setItem(REDDIT_AUTHOR_TAGS_LS_KEY, JSON.stringify(authorTagMap))
    } catch {
      /* localStorage may be unavailable */
    }
  }

  function tagAuthor(username: string, commentId: string, tag: string, delta: number): void {
    const anchor = buildAnchorUrl(commentId)
    incrementTagScore(authorTagMap, username, tag, anchor, delta)
    persist()
    applyHighlights(runtime, authorTagMap)
  }

  function setTag(username: string, tag: string, score: number, commentId: string): void {
    const anchor = buildAnchorUrl(commentId)
    addTag(authorTagMap, username, tag, anchor, score)
    persist()
    applyHighlights(runtime, authorTagMap)
  }

  function unsetTag(username: string, tag: string): void {
    removeTag(authorTagMap, username, tag)
    persist()
    applyHighlights(runtime, authorTagMap)
  }

  function buildAnchorUrl(commentId: string): string {
    const path = runtime.location.pathname.replace(/\/$/, '')
    return `${path}/${commentId}/`
  }

  function start(): void {
    runtime.addStyle(tagPanelCss)
    runtime.addStyle(`/*{{REDDIT_TIME_SAVER_CSS}}*/`)
    processElement(runtime, authorTagMap, tagAuthor, setTag, unsetTag, runtime.document.body)
    applyHighlights(runtime, authorTagMap)
    setupObserver(runtime, authorTagMap, tagAuthor, setTag, unsetTag)
  }

  return {
    start,
    getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)) as AuthorTagMap,
    tagAuthor,
    setTag,
    unsetTag,
    applyHighlights: () => applyHighlights(runtime, authorTagMap),
    processElement: (root: Node) =>
      processElement(runtime, authorTagMap, tagAuthor, setTag, unsetTag, root),
  }
}

export async function startRedditTimeSaver(runtime: Runtime): Promise<void> {
  const app = await createRedditApp(runtime)
  app.start()
}
