import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import { getTotalScore, tagColor } from '../../shared/author-labels'
import { findAuthorLinks, getAuthorName, isAuthorHeader } from './author-utils'

export function applyHighlights(runtime: Runtime, authorTagMap: AuthorTagMap): void {
  clearHighlights(runtime)
  for (const authorLink of findAuthorLinks(runtime.document.body)) {
    if (!isAuthorHeader(authorLink)) continue
    const username = getAuthorName(authorLink)
    if (!username) continue
    const tags = authorTagMap[username]
    if (!tags) continue

    const total = getTotalScore(tags)

    for (const [tagName, record] of Object.entries(tags)) {
      const tagUrl = new URL(record.url, runtime.location.origin).href
      authorLink.insertAdjacentHTML(
        'afterend',
        `<a class="gm-author-tag" href="${tagUrl}" target="_blank">${tagName}</a>`,
      )
      const tagEl = authorLink.nextElementSibling as HTMLElement
      tagEl.style.color = tagColor(record.score)
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

export function clearHighlights(runtime: Runtime): void {
  runtime.document.querySelectorAll('.gm-author-tag').forEach((el) => el.remove())
  for (let i = -3; i <= 3; i++) {
    const cls = `gm-highlight-${i < 0 ? `n${-i}` : i}`
    runtime.document.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls))
  }
}

function clampScore(score: number): number {
  return Math.max(-3, Math.min(3, score))
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
