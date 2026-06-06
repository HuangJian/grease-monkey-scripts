import { escapeHtml, escapeUrl } from '../../utils'
import { newChapters } from './state'
import type { NovelBook, NovelChapter, NovelData } from './types'

export type RenderNovelsContext = {
  onMarkSeen: (bookUrl: string) => void
}

const FALLBACK_DATE_LABEL = '刚刚更新'
const FOLD_THRESHOLD = 5

export function renderNovels(
  container: HTMLElement,
  data: NovelData | null,
  ctx: RenderNovelsContext,
): void {
  container.replaceChildren()

  const books = data?.books ?? []
  if (books.length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="gm-sp-novels-empty">尚未添加小说，请通过 ⚙ 添加书库 URL。</div>',
    )
    return
  }

  const sorted = [...books].sort((a, b) => {
    const aRead = newChapters(a).length === 0
    const bRead = newChapters(b).length === 0
    if (aRead && !bRead) return 1
    if (!aRead && bRead) return -1
    return 0
  })
  const wrap = sorted.map((book) => buildBookBlockHtml(book)).join('')
  container.insertAdjacentHTML('beforeend', `<div class="gm-sp-novels">${wrap}</div>`)
  container.querySelectorAll('.gm-sp-novels-chapter-link').forEach((link) => {
    link.addEventListener('click', () => {
      const bookBlock = link.closest('.gm-sp-novels-book') as HTMLElement
      ctx.onMarkSeen(bookBlock.dataset['bookUrl']!)
    })
  })
  container.querySelectorAll<HTMLButtonElement>('.gm-sp-novels-book-toggle').forEach((toggle) => {
    const hiddenCount = Number(toggle.dataset['hiddenCount']!)
    toggle.addEventListener('click', () => {
      const list = toggle.previousElementSibling as HTMLUListElement
      const isFolded = list.classList.toggle('gm-sp-novels-chapters-folded')
      toggle.textContent = isFolded ? `…还有 ${hiddenCount} 章未读` : '收起未读章节'
    })
  })
}

function buildBookBlockHtml(book: NovelBook): string {
  const titleText = escapeHtml(book.title || book.url)
  const bookUrl = escapeUrl(book.url)
  const bookLinkHtml = `<a class="gm-sp-novels-book-title" href="${bookUrl}" target="_blank"
    rel="noopener noreferrer">${titleText}</a>`

  if (book.siteId === 'unknown') {
    const errorText = book.error ?? '未知站点，暂不支持'
    return `<div class="gm-sp-novels-book gm-sp-novels-book-unknown" data-book-url="${bookUrl}">
      <div class="gm-sp-novels-book-header">
        ${bookLinkHtml}
        <span class="gm-sp-novels-book-status">未知站点</span>
      </div>
      <div class="gm-sp-novels-book-error">${errorText}</div>
    </div>`
  }

  if (book.error && book.latestChapters.length === 0) {
    return `<div class="gm-sp-novels-book" data-book-url="${bookUrl}">
      <div class="gm-sp-novels-book-header">
        ${bookLinkHtml}
        <span class="gm-sp-novels-book-status">加载失败</span>
      </div>
      <div class="gm-sp-novels-book-error">${book.error}</div>
    </div>`
  }

  const errorNoteHtml = book.error
    ? `<div class="gm-sp-novels-book-error">刷新失败：${book.error}</div>`
    : ''
  const unread = newChapters(book)
  if (unread.length === 0) {
    const statusText = '无更新'
    if (book.latestChapters.length > 0) {
      const latest = book.latestChapters[0]
      return `<div class="gm-sp-novels-book" data-book-url="${bookUrl}">
        <div class="gm-sp-novels-book-header">
          ${bookLinkHtml}
          <span class="gm-sp-novels-book-status">${statusText}</span>
        </div>
        ${errorNoteHtml}
        <ul class="gm-sp-novels-chapters">${buildReadChapterItemHtml(latest, book)}</ul>
      </div>`
    }
    return `<div class="gm-sp-novels-book" data-book-url="${bookUrl}">
      <div class="gm-sp-novels-book-header">
        ${bookLinkHtml}
        <span class="gm-sp-novels-book-status">${statusText}</span>
      </div>
      ${errorNoteHtml}
      <div class="gm-sp-novels-book-note">暂无新章节</div>
    </div>`
  }

  const statusText = `${unread.length} 章新`
  const folded = unread.length > FOLD_THRESHOLD
  const listClass = folded
    ? 'gm-sp-novels-chapters gm-sp-novels-chapters-folded'
    : 'gm-sp-novels-chapters'
  const chaptersHtml = unread.map((ch) => buildChapterItemHtml(ch)).join('')
  const toggleHtml = folded
    ? (() => {
        const hiddenCount = unread.length - 2
        const toggleText = `…还有 ${hiddenCount} 章未读`
        return `<button type="button" class="gm-sp-novels-book-toggle" data-folded="true"
          data-hidden-count="${hiddenCount}">${toggleText}</button>`
      })()
    : ''

  return `<div class="gm-sp-novels-book" data-book-url="${bookUrl}">
      <div class="gm-sp-novels-book-header">
        ${bookLinkHtml}
        <span class="gm-sp-novels-book-status">${statusText}</span>
      </div>
      ${errorNoteHtml}
      <ul class="${listClass}">${chaptersHtml}</ul>
      ${toggleHtml}
    </div>`
}

function buildChapterItemHtml(chapter: NovelChapter): string {
  const timeText =
    chapter.postedAt !== undefined ? formatPostedAt(chapter.postedAt) : FALLBACK_DATE_LABEL
  return `<li class="gm-sp-novels-chapter">
      <a class="gm-sp-novels-chapter-link" href="${escapeUrl(chapter.url)}" target="_blank" rel="noopener noreferrer">
        <span class="gm-sp-novels-chapter-time">${escapeHtml(timeText)}</span>
        <span class="gm-sp-novels-chapter-title">${escapeHtml(chapter.title)}</span>
      </a>
    </li>`
}

function buildReadChapterItemHtml(chapter: NovelChapter, book: NovelBook): string {
  const timeText = formatPostedAt(chapter.postedAt ?? book.fetchedAt) + '【已读】'
  return `<li class="gm-sp-novels-chapter gm-sp-novels-chapter-read">
      <a class="gm-sp-novels-chapter-link" href="${escapeUrl(chapter.url)}" target="_blank" rel="noopener noreferrer">
        <span class="gm-sp-novels-chapter-time">${escapeHtml(timeText)}</span>
        <span class="gm-sp-novels-chapter-title">${escapeHtml(chapter.title)}</span>
      </a>
    </li>`
}

function formatPostedAt(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (sameDay(d, now)) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  return d.getFullYear() === now.getFullYear() ? `${m}-${day}` : `${d.getFullYear()}-${m}-${day}`
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
