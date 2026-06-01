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
import { htmlToElement } from '../utils'

const STORAGE_KEY = 'reddit_author_tags'
const BTN_CLASS = 'gm-tag-btn'
const PROCESSED_CLASS = 'gm-processed'

export { STORAGE_KEY, BTN_CLASS, PROCESSED_CLASS }

export type RedditApp = Awaited<ReturnType<typeof createRedditApp>>

async function loadAuthorTagMap(runtime: Runtime): Promise<AuthorTagMap> {
  const value = await runtime.getValue<unknown>(STORAGE_KEY, {})
  return parseAuthorTagMap(value)
}

export function getAuthorName(authorLink: Element): string {
  const href = authorLink.getAttribute('href') || ''
  const match = href.match(/\/user\/([^/]+)/i)
  if (!match) return ''
  try {
    return decodeURIComponent(match[1])
  } catch {
    return ''
  }
}

export function getCommentId(authorLink: Element): string {
  const comment = authorLink.closest('[id*="t1_"], .thing[id]')
  return comment?.id || ''
}

export function buildAnchorUrl(runtime: Runtime, commentId: string): string {
  const path = runtime.location.pathname.replace(/\/$/, '')
  return `${path}/${commentId}/`
}

export async function createRedditApp(runtime: Runtime) {
  const authorTagMap = await loadAuthorTagMap(runtime)

  function persist(): void {
    void runtime.setValue(STORAGE_KEY, authorTagMap)
  }

  function tagAuthor(username: string, commentId: string, tag: string, delta: number): void {
    const anchor = buildAnchorUrl(runtime, commentId)
    incrementTagScore(authorTagMap, username, tag, anchor, delta)
    persist()
    applyHighlights()
  }

  function setTag(username: string, tag: string, score: number, commentId: string): void {
    const anchor = buildAnchorUrl(runtime, commentId)
    addTag(authorTagMap, username, tag, anchor, score)
    persist()
    applyHighlights()
  }

  function unsetTag(username: string, tag: string): void {
    removeTag(authorTagMap, username, tag)
    persist()
    applyHighlights()
  }

  function attachTagButton(authorLink: Element): void {
    if (authorLink.classList.contains(PROCESSED_CLASS)) return
    const username = getAuthorName(authorLink)
    if (!username) return

    const commentId = getCommentId(authorLink)

    const authorNameSlot = authorLink.closest('span[slot="authorName"]')
    if (authorNameSlot) {
      if (authorNameSlot.classList.contains(PROCESSED_CLASS)) return
      authorNameSlot.classList.add(PROCESSED_CLASS)
    } else {
      const meta = authorLink.closest('[slot="commentMeta"]')
      if (meta) {
        if (meta.classList.contains(PROCESSED_CLASS)) return
        meta.classList.add(PROCESSED_CLASS)
      } else {
        if (authorLink.nextElementSibling?.classList.contains(BTN_CLASS)) return
      }
    }

    authorLink.classList.add(PROCESSED_CLASS)
    const btn = htmlToElement<HTMLElement>(
      runtime.document,
      `<a class="${BTN_CLASS}" href="#;">🏷</a>`,
    )
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const callbacks: TagPanelCallbacks = {
        onTagAuthor: (id, commentNum, tag, delta) =>
          tagAuthor(id, commentNum as string, tag, delta),
        onSetTag: (id, tag, score, commentNum) => setTag(id, tag, score, commentNum as string),
        onUnsetTag: (id, tag) => unsetTag(id, tag),
      }
      const quickLabels: QuickLabels = {
        shame: { tag: '若婴', display: '若婴' },
        thank: { tag: '智者', display: '智者' },
      }
      buildTagPanel(runtime, authorTagMap, username, commentId, btn, callbacks, quickLabels)
    })
    if (authorNameSlot) {
      authorNameSlot.insertAdjacentElement('afterend', btn)
    } else {
      const meta = authorLink.closest('[slot="commentMeta"]')
      if (meta) {
        meta.appendChild(btn)
      } else {
        authorLink.insertAdjacentElement('afterend', btn)
      }
    }
  }

  function isAuthorHeader(link: Element): boolean {
    const text = (link.textContent || '').trim()
    if (!text) return false
    if (text.startsWith('u/') || text.startsWith('/u/')) return false
    return true
  }

  function findCommentContent(authorLink: Element): Element | null {
    const meta = authorLink.closest('[slot="commentMeta"]')
    if (meta) {
      return meta.parentElement?.querySelector('[slot="comment"]') ?? null
    }
    const entry = authorLink.closest('.entry')
    if (entry) {
      return entry.querySelector('.md')
    }
    return null
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
    for (const authorLink of findAuthorLinks(runtime.document.body)) {
      if (!isAuthorHeader(authorLink)) continue
      const username = getAuthorName(authorLink)
      if (!username) continue
      const tags = authorTagMap[username]
      if (!tags) continue

      const total = getTotalScore(tags)

      for (const [tagName, record] of Object.entries(tags)) {
        const tagEl = htmlToElement<HTMLElement>(
          runtime.document,
          `<a class="gm-author-tag" href="${new URL(record.url, runtime.location.origin).href}" target="_blank"></a>`,
        )
        tagEl.textContent = tagName
        tagEl.style.color = tagColor(record.score)
        authorLink.insertAdjacentElement('afterend', tagEl)
      }

      const content = findCommentContent(authorLink)
      if (!content) continue
      const clamped = clampScore(total)
      if (clamped !== 0) {
        const cls = `gm-highlight-${clamped < 0 ? `n${-clamped}` : clamped}`
        content.classList.add(cls)
      }
    }
  }

  function processElement(root: Node): void {
    const links = findAuthorLinks(root)
    for (const link of links) {
      if (!isAuthorHeader(link)) continue
      const username = getAuthorName(link)
      if (!username) continue
      if (link.classList.contains(PROCESSED_CLASS)) continue
      attachTagButton(link)
    }
  }

  function setupObserver(): void {
    let timer: ReturnType<typeof setTimeout> | null = null
    const observer = new runtime.MutationObserver((mutations) => {
      let found = false
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue
          const links = findAuthorLinks(node)
          for (const link of links) {
            if (!isAuthorHeader(link)) continue
            if (link.classList.contains(PROCESSED_CLASS)) continue
            attachTagButton(link)
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

  function start(): void {
    runtime.addStyle(tagPanelCss)
    runtime.addStyle(`/*{{REDDIT_TIME_SAVER_CSS}}*/`)
    processElement(runtime.document.body)
    applyHighlights()
    setupObserver()
  }

  return {
    start,
    getAuthorTagMap: () => JSON.parse(JSON.stringify(authorTagMap)) as AuthorTagMap,
    tagAuthor,
    setTag,
    unsetTag,
    applyHighlights: () => applyHighlights(),
    processElement: (root: Node) => processElement(root),
  }
}

function findAuthorLinks(root: Node): Element[] {
  const links: Element[] = []

  function walk(node: Node): void {
    if (node.nodeType !== 1) return
    const el = node as Element
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || ''
      if (href.toLowerCase().includes('/user/')) {
        links.push(el)
      }
    }
    const shadow = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
    if (shadow) {
      walk(shadow)
    }
    let child = el.firstChild
    while (child) {
      walk(child)
      child = child.nextSibling
    }
  }

  walk(root)
  return links
}

export async function startRedditTimeSaver(runtime: Runtime): Promise<void> {
  const app = await createRedditApp(runtime)
  app.start()
}
