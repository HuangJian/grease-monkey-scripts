import type { Runtime } from '../runtime'
import type { AuthorMap } from './author-labels'
import { defaultLabels, getAuthorLabel } from './author-labels'
import { htmlToElement } from '../utils'
import { COMMENT_BOX_FIRST_CELL_SELECTOR, COMMENT_CELLS_SELECTOR } from './constants'

function getTagMarkup(text: string, color: string): string {
  return ` <span style="color:${color}">[${text}]</span>`
}

function getAuthorIdAndCommentNumber(
  thankArea: Element,
): { id: string; commentNumber: string } | null {
  const cell = thankArea.closest('.cell')
  const id = cell?.querySelector('a.dark[href]')?.getAttribute('href')?.split('/')[2]
  const commentNumber = cell?.querySelector('span.no')?.textContent
  if (!id || !commentNumber) {
    return null
  }
  return { id, commentNumber }
}

export function highlightCommentsAndTopics(
  runtime: Runtime,
  shamedMap: AuthorMap,
  thankedMap: AuthorMap,
): void {
  runtime.document.querySelectorAll('.cell').forEach((cell) => {
    const it = cell.querySelector('strong > a[href]')
    if (!it) return
    const id = it.getAttribute('href')?.split('/')[2]
    if (!id) {
      return
    }
    const shameLabel = getAuthorLabel(shamedMap, id, defaultLabels.shame)
    const thankLabel = getAuthorLabel(thankedMap, id, defaultLabels.thank)
    if (shamedMap.has(id) && !it.textContent?.includes(shameLabel)) {
      it.insertAdjacentHTML('beforeend', getTagMarkup(shameLabel, 'red'))
      it.closest('td')?.classList.add('shame')
    }
    if (thankedMap.has(id) && !it.textContent?.includes(thankLabel)) {
      it.insertAdjacentHTML('beforeend', getTagMarkup(thankLabel, 'darkgreen'))
      it.closest('tr')?.classList.add('nice-author')
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

export function addShameButtons(
  runtime: Runtime,
  likeDislikeAuthor: (id: string, commentNumber: number | string, isLike: boolean) => void,
): void {
  const btn = htmlToElement<HTMLAnchorElement>(
    runtime.document,
    '<a style="margin-left: 12px; color: lightpink" class="thank" href="#;">不说人话</a>',
  )

  btn.addEventListener('click', () => {
    const authorId = runtime.document.querySelector('.header .avatar')?.getAttribute('alt')
    if (authorId) {
      likeDislikeAuthor(authorId, 0, false)
    }
  })
  runtime.document.querySelector('.topic_buttons')?.appendChild(btn)

  runtime.document.querySelectorAll('.thank_area').forEach((it) => {
    const info = getAuthorIdAndCommentNumber(it)
    if (!info) return
    const cloned = btn.cloneNode(true) as HTMLAnchorElement
    cloned.addEventListener('click', () => likeDislikeAuthor(info.id, info.commentNumber, false))
    it.appendChild(cloned)
  })
}

export function addMoreThankActions(
  runtime: Runtime,
  likeDislikeAuthor: (id: string, commentNumber: number | string, isLike: boolean) => void,
): void {
  const topic = runtime.document.querySelector('#topic_thank') as HTMLElement | null
  if (topic) {
    topic.addEventListener('mouseup', () => {
      setTimeout(() => {
        const authorId = runtime.document.querySelector('.header .avatar')?.getAttribute('alt')
        if (authorId) {
          likeDislikeAuthor(authorId, 0, true)
        }
      })
    })
  }

  Array.from(runtime.document.querySelectorAll('.thank_area > a.thank'))
    .filter((it) => it.textContent?.includes('感谢回复者'))
    .forEach((it) => {
      const info = getAuthorIdAndCommentNumber(it)
      if (!info) return
      it.addEventListener('mouseup', () =>
        setTimeout(() => likeDislikeAuthor(info.id, info.commentNumber, true)),
      )
    })
}
