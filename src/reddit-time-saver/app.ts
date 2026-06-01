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

  let closePanel: (() => void) | null = null

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

  function dismissPanel(): void {
    closePanel?.()
    closePanel = null
    const panel = runtime.document.querySelector('.gm-tag-panel')
    if (panel) panel.remove()
  }

  function buildTagPanel(username: string, commentId: string, triggerBtn: Element): void {
    dismissPanel()

    const panel = htmlToElement<HTMLElement>(
      runtime.document,
      `<div class="gm-tag-panel">
        <div class="gm-tag-panel-header">
          <span class="gm-tag-panel-title"></span>
          <button class="gm-tag-panel-close">✕</button>
        </div>
        <div class="gm-tag-list"></div>
        <div class="gm-tag-add">
          <input class="gm-tag-input-name" type="text" placeholder="标签名">
          <input class="gm-tag-input-score" type="number" value="0" step="1">
          <button class="gm-tag-add-btn">添加</button>
        </div>
        <div class="gm-tag-quick">
          <button class="gm-tag-quick-shame">若婴 (-1)</button>
          <button class="gm-tag-quick-thank">智者 (+1)</button>
        </div>
      </div>`,
    )

    panel.querySelector('.gm-tag-panel-title')!.textContent = username

    const list = panel.querySelector('.gm-tag-list')!

    panel.querySelector('.gm-tag-panel-close')!.addEventListener('click', dismissPanel)

    function renderTags(): void {
      const tags = authorTagMap[username] || {}
      const entries = Object.entries(tags)
      list.innerHTML = ''

      if (entries.length === 0) {
        list.appendChild(
          htmlToElement(runtime.document, '<div class="gm-tag-empty">暂无标签</div>'),
        )
        return
      }

      for (const [tagName, record] of entries) {
        const scoreText = record.score > 0 ? `+${record.score}` : String(record.score)
        const row = htmlToElement<HTMLElement>(
          runtime.document,
          `<div class="gm-tag-row">
            <span class="gm-tag-name"></span>
            <span class="gm-tag-score">${scoreText}</span>
            <button class="gm-tag-inc">+1</button>
            <button class="gm-tag-dec">-1</button>
            <button class="gm-tag-del">删除</button>
          </div>`,
        )

        row.querySelector('.gm-tag-name')!.textContent = tagName

        const [incBtn, decBtn, delBtn] = row.querySelectorAll('button')
        incBtn.addEventListener('click', () => {
          tagAuthor(username, commentId, tagName, 1)
          renderTags()
        })
        decBtn.addEventListener('click', () => {
          tagAuthor(username, commentId, tagName, -1)
          renderTags()
        })
        delBtn.addEventListener('click', () => {
          unsetTag(username, tagName)
          renderTags()
        })

        list.appendChild(row)
      }
    }

    const addNameInput = panel.querySelector('.gm-tag-input-name')! as HTMLInputElement
    const addScoreInput = panel.querySelector('.gm-tag-input-score')! as HTMLInputElement
    panel.querySelector('.gm-tag-add-btn')!.addEventListener('click', () => {
      const name = addNameInput.value.trim()
      if (!name) return
      const score = parseInt(addScoreInput.value, 10)
      if (score === 0 || isNaN(score)) return
      setTag(username, name, score, commentId)
      addNameInput.value = ''
      addScoreInput.value = '0'
      renderTags()
    })

    panel.querySelector('.gm-tag-quick-shame')!.addEventListener('click', () => {
      tagAuthor(username, commentId, '若婴', -1)
      renderTags()
    })
    panel.querySelector('.gm-tag-quick-thank')!.addEventListener('click', () => {
      tagAuthor(username, commentId, '智者', 1)
      renderTags()
    })

    renderTags()

    const rect = triggerBtn.getBoundingClientRect()
    panel.style.position = 'fixed'
    panel.style.top = `${rect.bottom + 4}px`
    panel.style.left = `${Math.min(rect.left, (runtime.document.defaultView?.innerWidth ?? 320) - 320)}px`

    runtime.document.body.appendChild(panel)

    const outsideHandler = (e: MouseEvent) => {
      if ((e.target as Element).closest(`.${BTN_CLASS}`)) return
      if (!panel.contains(e.target as Node)) {
        dismissPanel()
      }
    }
    closePanel = () => {
      runtime.document.removeEventListener('mousedown', outsideHandler)
    }
    setTimeout(() => {
      if (!closePanel) return
      runtime.document.addEventListener('mousedown', outsideHandler)
    }, 0)
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
      buildTagPanel(username, commentId, btn)
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
