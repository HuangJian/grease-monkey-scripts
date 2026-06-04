import { htmlToElement } from '../../utils'
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
  const document = container.ownerDocument
  container.replaceChildren()

  const books = data?.books ?? []
  if (books.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(
      document,
      '<div class="gm-sp-novels-empty">尚未添加小说，请通过 ⚙ 添加书库 URL。</div>',
    )
    container.appendChild(empty)
    return
  }

  const wrap = htmlToElement<HTMLDivElement>(document, '<div class="gm-sp-novels"></div>')
  for (const book of books) {
    wrap.appendChild(buildBookBlock(document, book, ctx))
  }
  container.appendChild(wrap)
}

function buildBookBlock(
  document: Document,
  book: NovelBook,
  ctx: RenderNovelsContext,
): HTMLElement {
  const block = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-novels-book" data-book-url=""></div>`,
  )
  block.dataset['bookUrl'] = book.url

  const header = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-novels-book-header">
      <a class="gm-sp-novels-book-title" target="_blank" rel="noopener noreferrer"></a>
      <span class="gm-sp-novels-book-status"></span>
    </div>`,
  )
  const titleLink = header.querySelector('.gm-sp-novels-book-title') as HTMLAnchorElement
  titleLink.href = book.url
  titleLink.textContent = book.title || book.url
  const statusEl = header.querySelector('.gm-sp-novels-book-status') as HTMLSpanElement
  block.appendChild(header)

  if (book.siteId === 'unknown') {
    block.classList.add('gm-sp-novels-book-unknown')
    statusEl.textContent = '未知站点'
    statusEl.title = '该站点暂不支持自动抓取'
    block.appendChild(
      buildNote(document, 'gm-sp-novels-book-error', book.error ?? '未知站点，暂不支持'),
    )
    return block
  }

  if (book.error && book.latestChapters.length === 0) {
    statusEl.textContent = '加载失败'
    block.appendChild(buildNote(document, 'gm-sp-novels-book-error', book.error))
    return block
  }

  if (book.error) {
    block.appendChild(buildNote(document, 'gm-sp-novels-book-error', `刷新失败：${book.error}`))
  }

  const unread = newChapters(book)
  if (unread.length === 0) {
    statusEl.textContent = '无更新'
    block.appendChild(buildNote(document, 'gm-sp-novels-book-note', '暂无新章节'))
    return block
  }

  statusEl.textContent = `${unread.length} 章新`
  const list = htmlToElement<HTMLUListElement>(document, '<ul class="gm-sp-novels-chapters"></ul>')
  for (const ch of unread) {
    list.appendChild(buildChapterItem(document, ch))
  }

  const folded = unread.length > FOLD_THRESHOLD
  if (folded) list.classList.add('gm-sp-novels-chapters-folded')
  block.appendChild(list)

  if (folded) {
    const hiddenCount = unread.length - 2
    const toggle = htmlToElement<HTMLButtonElement>(
      document,
      `<button type="button" class="gm-sp-novels-book-toggle">…还有 ${hiddenCount} 章未读</button>`,
    )
    toggle.addEventListener('click', () => {
      const isFolded = list.classList.toggle('gm-sp-novels-chapters-folded')
      toggle.textContent = isFolded ? `…还有 ${hiddenCount} 章未读` : '收起未读章节'
    })
    block.appendChild(toggle)
  }

  list.querySelectorAll<HTMLAnchorElement>('a.gm-sp-novels-chapter-link').forEach((link) => {
    link.addEventListener('click', () => {
      ctx.onMarkSeen(book.url)
    })
  })

  return block
}

function buildChapterItem(document: Document, chapter: NovelChapter): HTMLElement {
  const item = htmlToElement<HTMLLIElement>(
    document,
    `<li class="gm-sp-novels-chapter">
      <a class="gm-sp-novels-chapter-link" target="_blank" rel="noopener noreferrer">
        <span class="gm-sp-novels-chapter-time"></span>
        <span class="gm-sp-novels-chapter-title"></span>
      </a>
    </li>`,
  )
  const link = item.querySelector('.gm-sp-novels-chapter-link') as HTMLAnchorElement
  link.href = chapter.url
  const time = item.querySelector('.gm-sp-novels-chapter-time') as HTMLSpanElement
  time.textContent =
    chapter.postedAt !== undefined ? formatPostedAt(chapter.postedAt) : FALLBACK_DATE_LABEL
  const title = item.querySelector('.gm-sp-novels-chapter-title') as HTMLSpanElement
  title.textContent = chapter.title
  return item
}

function buildNote(document: Document, className: string, message: string): HTMLElement {
  const note = htmlToElement<HTMLDivElement>(document, `<div class="${className}"></div>`)
  note.textContent = message
  return note
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
