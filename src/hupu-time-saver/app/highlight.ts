import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import { getTotalScore, tagColor } from '../../shared/author-labels'
import { escapeHtml } from '../../utils'
import { findAllAuthorLinks, isAuthorNameLink, extractEuid } from '../selectors'

export function applyHighlights(
  runtime: Runtime,
  authorTagMap: AuthorTagMap,
  euidToPuidMap: Map<string, string>,
): void {
  clearHighlights(runtime)
  for (const authorLink of findAllAuthorLinks(runtime.document.body)) {
    if (!isAuthorNameLink(authorLink)) continue
    const euid = extractEuid(authorLink.getAttribute('href') || '')
    if (!euid) continue
    const puid = euidToPuidMap.get(euid) || euid
    const tags = authorTagMap[puid]
    if (!tags) continue

    const total = getTotalScore(tags)
    for (const [tagName, record] of Object.entries(tags)) {
      const tagUrl = new URL(record.url, runtime.location.origin).href
      authorLink.insertAdjacentHTML(
        'afterend',
        `<a class="gm-author-tag" href="${escapeHtml(tagUrl)}" target="_blank">${escapeHtml(tagName)}</a>`,
      )
      const tagEl = authorLink.nextElementSibling as HTMLElement
      tagEl.style.color = tagColor(record.score)
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
