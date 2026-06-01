import type { Runtime } from '../runtime'
import type { AuthorTagMap } from '../shared/author-labels'
import { getTotalScore, tagColor } from '../shared/author-labels'
import { htmlToElement } from '../utils'
import { COMMENT_BOX_FIRST_CELL_SELECTOR, COMMENT_CELLS_SELECTOR } from './constants'

const SCORE_CLASS_MIN = -3
const SCORE_CLASS_MAX = 3
const SCORE_CLASS_RE = /^gm-author--?\d+$/

function clampScoreClass(score: number): number {
  if (score > SCORE_CLASS_MAX) return SCORE_CLASS_MAX
  if (score < SCORE_CLASS_MIN) return SCORE_CLASS_MIN
  return score
}

function clearExistingHighlight(authorLink: Element): void {
  authorLink.querySelectorAll('.gm-author-tag').forEach((el) => el.remove())
  const tr = authorLink.closest('tr')
  if (!tr) return
  Array.from(tr.classList)
    .filter((c) => SCORE_CLASS_RE.test(c))
    .forEach((c) => tr.classList.remove(c))
}

export function scrollToComment(number: string, runtime: Runtime): void {
  if (number === '0') {
    runtime.document.defaultView?.scrollTo(0, 0)
    return
  }
  for (const cell of runtime.document.querySelectorAll('.cell[id]')) {
    const no = cell.querySelector('span.no')?.textContent?.trim()
    if (no === number) {
      cell.scrollIntoView({ behavior: 'smooth', block: 'center' })
      break
    }
  }
}

export function highlightCommentsAndTopics(runtime: Runtime, authorTagMap: AuthorTagMap): void {
  const origin = runtime.location.origin
  runtime.document.querySelectorAll('.cell').forEach((cell) => {
    const authorLink = cell.querySelector('strong > a[href]')
    if (!authorLink) return
    const id = authorLink.getAttribute('href')?.split('/')[2]
    if (!id) return
    const tags = authorTagMap[id]
    if (!tags) return

    clearExistingHighlight(authorLink)

    const total = getTotalScore(tags)
    const cls = `gm-author-${clampScoreClass(total)}`
    authorLink.closest('tr')?.classList.add(cls)

    for (const [tagName, tag] of Object.entries(tags)) {
      const fullUrl = new URL(tag.url, origin).href
      const [pathPart] = tag.url.split('#')
      const isSamePage = pathPart === runtime.location.pathname.replace(/^\//, '')
      const tagLink = htmlToElement<HTMLElement>(
        runtime.document,
        `<a class="gm-author-tag" href="${fullUrl}" style="color:${tagColor(tag.score)}"${isSamePage ? '' : ' target="_blank"'}>x</a>`,
      )
      tagLink.textContent = tagName
      if (isSamePage) {
        tagLink.addEventListener('click', (e) => {
          e.preventDefault()
          const num = tag.url.split('#')[1]
          scrollToComment(num, runtime)
        })
      }
      authorLink.insertAdjacentElement('beforeend', tagLink)
    }
  })
}

export function reorderCommentsByHearts(runtime: Runtime): void {
  const heartsFlagKey = 'data-hearts'
  const comments = Array.from(runtime.document.querySelectorAll(COMMENT_CELLS_SELECTOR))
  comments.forEach((comment) => {
    const hearts = Array.from(comment.querySelectorAll('[alt="❤️"]'))
      .map((it) => parseInt(it.nextSibling?.textContent || '0', 10))
      .reduce((prev, curr) => prev + curr, 0)
    comment.setAttribute(heartsFlagKey, String(hearts))
  })

  const countsElement = runtime.document.querySelector(COMMENT_BOX_FIRST_CELL_SELECTOR)
  comments
    .filter((it) => it.getAttribute(heartsFlagKey) !== '0')
    .reverse()
    .sort(
      (a, b) =>
        parseInt(a.getAttribute(heartsFlagKey) || '0', 10) -
        parseInt(b.getAttribute(heartsFlagKey) || '0', 10),
    )
    .forEach((it) => countsElement?.insertAdjacentElement('afterend', it))
}

export function addTargetToTopicLinks(runtime: Runtime): void {
  runtime.document
    .querySelectorAll('.topic-link, .item_hot_topic_title > a')
    .forEach((it) => it.setAttribute('target', '_blank'))
}
