import { useState } from 'preact/hooks'
import { escapeHtml, escapeUrl } from '../../utils'
import type { SourceComponentProps } from '../types'
import { newChapters } from './state'
import type { NovelBook, NovelChapter, NovelData } from './types'

const FALLBACK_DATE_LABEL = '刚刚更新'
const FOLD_THRESHOLD = 5

export type NovelsComponentProps = SourceComponentProps<NovelData> & {
  onMarkSeen: (bookUrl: string) => void
}

export function NovelsComponent({ data, onMarkSeen }: NovelsComponentProps) {
  const books = data?.books ?? []

  if (books.length === 0) {
    return (
      <div class="gm-sp-novels">
        <div class="gm-sp-empty">尚未添加小说，请通过 ⚙ 添加书库 URL。</div>
      </div>
    )
  }

  const sorted = [...books].sort((a, b) => {
    const aRead = newChapters(a).length === 0
    const bRead = newChapters(b).length === 0
    if (aRead && !bRead) return 1
    if (!aRead && bRead) return -1
    return 0
  })

  return (
    <div class="gm-sp-novels">
      {sorted.map((book) => (
        <BookBlock key={book.url} book={book} onMarkSeen={onMarkSeen} />
      ))}
    </div>
  )
}

function BookBlock({
  book,
  onMarkSeen,
}: {
  book: NovelBook
  onMarkSeen: (bookUrl: string) => void
}) {
  const titleText = escapeHtml(book.title || book.url)
  const bookUrl = escapeUrl(book.url)
  const unread = newChapters(book)

  if (book.siteId === 'unknown') {
    const errorText = book.error ?? '未知站点，暂不支持'
    return (
      <div class="gm-sp-novels-book gm-sp-novels-book-unknown" data-book-url={bookUrl}>
        <div class="gm-sp-novels-book-header">
          <BookTitleLink url={book.url} titleText={titleText} />
          <span class="gm-sp-novels-book-status">未知站点</span>
        </div>
        <div class="gm-sp-novels-book-error">{errorText}</div>
      </div>
    )
  }

  if (book.error && book.latestChapters.length === 0) {
    return (
      <div class="gm-sp-novels-book" data-book-url={bookUrl}>
        <div class="gm-sp-novels-book-header">
          <BookTitleLink url={book.url} titleText={titleText} />
          <span class="gm-sp-novels-book-status">加载失败</span>
        </div>
        <div class="gm-sp-novels-book-error">{book.error}</div>
      </div>
    )
  }

  const errorNoteEl = book.error ? (
    <div class="gm-sp-novels-book-error">刷新失败：{book.error}</div>
  ) : null

  if (unread.length === 0) {
    const statusText = '无更新'
    return (
      <div class="gm-sp-novels-book" data-book-url={bookUrl}>
        <div class="gm-sp-novels-book-header">
          <BookTitleLink url={book.url} titleText={titleText} />
          <span class="gm-sp-novels-book-status gm-sp-novels-book-status-none">{statusText}</span>
        </div>
        {errorNoteEl}
        {book.latestChapters.length > 0 ? (
          <ul class="gm-sp-list gm-sp-list-col">
            <ReadChapterItem chapter={book.latestChapters[0]!} book={book} />
          </ul>
        ) : (
          <div class="gm-sp-novels-book-note">暂无新章节</div>
        )}
      </div>
    )
  }

  const statusText = `${unread.length} 章新`

  return (
    <div class="gm-sp-novels-book" data-book-url={bookUrl}>
      <div class="gm-sp-novels-book-header">
        <BookTitleLink url={book.url} titleText={titleText} />
        <span class="gm-sp-novels-book-status">{statusText}</span>
      </div>
      {errorNoteEl}
      <ChapterList chapters={unread} onMarkSeen={() => onMarkSeen(book.url)} />
    </div>
  )
}

function BookTitleLink({ url, titleText }: { url: string; titleText: string }) {
  return (
    <a
      class="gm-sp-novels-book-title"
      href={escapeUrl(url)}
      target="_blank"
      rel="noopener noreferrer"
    >
      {titleText}
    </a>
  )
}

function ChapterList({
  chapters,
  onMarkSeen,
}: {
  chapters: NovelChapter[]
  onMarkSeen: () => void
}) {
  const folded = chapters.length > FOLD_THRESHOLD
  const [userExpanded, setUserExpanded] = useState(false)
  const isFolded = folded && !userExpanded
  const displayChapters = isFolded ? chapters.slice(0, 2) : chapters
  const hiddenCount = chapters.length - displayChapters.length

  return (
    <>
      <ul class={`gm-sp-list gm-sp-list-col${isFolded ? ' gm-sp-novels-chapters-folded' : ''}`}>
        {displayChapters.map((ch) => (
          <ChapterItem key={ch.url} chapter={ch} onMarkSeen={onMarkSeen} />
        ))}
      </ul>
      {chapters.length > FOLD_THRESHOLD && (
        <button
          type="button"
          class="gm-sp-novels-book-toggle"
          onClick={() => setUserExpanded(!userExpanded)}
        >
          {isFolded ? `…还有 ${hiddenCount} 章未读` : '收起未读章节'}
        </button>
      )}
    </>
  )
}

function ChapterItem({ chapter, onMarkSeen }: { chapter: NovelChapter; onMarkSeen: () => void }) {
  const timeText =
    chapter.postedAt !== undefined ? formatPostedAt(chapter.postedAt) : FALLBACK_DATE_LABEL
  const href = escapeUrl(chapter.url)
  return (
    <li class="gm-sp-novels-chapter">
      <a
        class="gm-sp-novels-chapter-link"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          e.preventDefault()
          // window.open bypasses sudugu.org v7.js ad script that intercepts <a> click events
          window.open(href, '_blank')
          onMarkSeen()
        }}
      >
        <span class="gm-sp-novels-chapter-time">{escapeHtml(timeText)}</span>
        <span class="gm-sp-novels-chapter-title">{escapeHtml(chapter.title)}</span>
      </a>
    </li>
  )
}

function ReadChapterItem({ chapter, book }: { chapter: NovelChapter; book: NovelBook }) {
  const timeText = formatPostedAt(chapter.postedAt ?? book.fetchedAt) + '【已读】'
  return (
    <li class="gm-sp-novels-chapter">
      <a
        class="gm-sp-novels-chapter-link"
        href={escapeUrl(chapter.url)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="gm-sp-novels-chapter-time">{escapeHtml(timeText)}</span>
        <span class="gm-sp-novels-chapter-title">{escapeHtml(chapter.title)}</span>
      </a>
    </li>
  )
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
