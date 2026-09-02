import { useState } from 'preact/hooks'
import { escapeUrl } from '../../utils'
import type { SourceComponentProps } from '../types'
import { newChapterCount, newChapters } from './state'
import { sourceLabel, sourceUrl, variantUrl } from './mirror'
import { normalizeBooks } from './migrate'
import type { NovelBook, NovelChapter, NovelChapterVariant, NovelData } from './types'

const FALLBACK_DATE_LABEL = '未知'
const FOLD_THRESHOLD = 3

export type NovelsComponentProps = SourceComponentProps<NovelData> & {
  onMarkSeen: (bookId: string) => void
}

export function NovelsComponent({ data, onMarkSeen }: NovelsComponentProps) {
  // Normalize at the read path so legacy cached data (without `sources`) and
  // freshly-fetched books both render through the same component.
  const books = normalizeBooks(data?.books ?? [])

  if (books.length === 0) {
    return (
      <div class="gm-sp-novels">
        <div class="gm-sp-empty">尚未添加小说，请通过 ⚙ 添加书库 URL。</div>
      </div>
    )
  }

  const sorted = [...books].sort((a, b) => {
    const aRead = newChapterCount(a) === 0
    const bRead = newChapterCount(b) === 0
    if (aRead && !bRead) return 1
    if (!aRead && bRead) return -1
    return 0
  })

  return (
    <div class="gm-sp-novels">
      {sorted.map((book) => (
        <BookBlock key={book.id} book={book} onMarkSeen={onMarkSeen} />
      ))}
    </div>
  )
}

function BookBlock({
  book,
  onMarkSeen,
}: {
  book: NovelBook
  onMarkSeen: (bookId: string) => void
}) {
  const titleText = book.title || book.sources[0]?.url || book.id
  const unread = newChapters(book)
  const unreadCount = newChapterCount(book)
  const multiSource = book.sources.length > 1
  const unknown = book.sources.length > 0 && book.sources.every((s) => s.siteId === 'unknown')

  if (unknown) {
    const errorText = book.error || '未知站点，暂不支持'
    return (
      <div class="gm-sp-novels-book gm-sp-novels-book-unknown" data-book-id={book.id}>
        <div class="gm-sp-novels-book-header">
          <BookTitleLink book={book} titleText={titleText} />
          <span class="gm-sp-novels-book-status">未知站点</span>
        </div>
        <div class="gm-sp-novels-book-error">{errorText}</div>
      </div>
    )
  }

  if (book.error && book.latestChapters.length === 0) {
    return (
      <div class="gm-sp-novels-book" data-book-id={book.id}>
        <div class="gm-sp-novels-book-header">
          <BookTitleLink book={book} titleText={titleText} />
          <span class="gm-sp-novels-book-status">加载失败</span>
        </div>
        <div class="gm-sp-novels-book-error">{book.error}</div>
      </div>
    )
  }

  const errorNoteEl = book.error ? (
    <div class="gm-sp-novels-book-error">刷新失败：{book.error}</div>
  ) : null

  if (unreadCount === 0) {
    return (
      <div class="gm-sp-novels-book" data-book-id={book.id}>
        <div class="gm-sp-novels-book-header">
          <BookTitleLink book={book} titleText={titleText} />
          <span class="gm-sp-novels-book-status gm-sp-novels-book-status-none">无更新</span>
        </div>
        {book.sources.length > 1 ? <BookSourceSummary book={book} /> : null}
        {errorNoteEl}
        {book.latestChapters.length > 0 ? (
          <ul class="gm-sp-list gm-sp-list-col">
            <ReadChapterItem
              chapter={book.latestChapters[0]!}
              book={book}
              multiSource={multiSource}
            />
          </ul>
        ) : (
          <div class="gm-sp-novels-book-note">暂无新章节</div>
        )}
      </div>
    )
  }

  return (
    <div class="gm-sp-novels-book" data-book-id={book.id}>
      <div class="gm-sp-novels-book-header">
        <BookTitleLink book={book} titleText={titleText} />
        <span class="gm-sp-novels-book-status">{`${unreadCount} 章新`}</span>
      </div>
      {book.sources.length > 1 ? <BookSourceSummary book={book} /> : null}
      {errorNoteEl}
      <ChapterList
        chapters={unread}
        book={book}
        multiSource={multiSource}
        onMarkSeen={() => onMarkSeen(book.id)}
      />
    </div>
  )
}

function BookTitleLink({ book, titleText }: { book: NovelBook; titleText: string }) {
  const primary = book.sources[0]
  const url = primary ? sourceUrl(primary) : book.id
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

/** Small multi-source progress summary: `sudugu 120 · biquge 118`, `⚠` on failures. */
function BookSourceSummary({ book }: { book: NovelBook }) {
  return (
    <div class="gm-sp-novels-book-sources">
      {book.sources.map((s) => (
        <span class="gm-sp-novels-book-src" key={s.url} data-failed={s.error ? 'true' : 'false'}>
          {s.error ? '⚠ ' : ''}
          {sourceLabel(s.url)}
          {s.error ? '' : ` ${s.chapterCount}`}
        </span>
      ))}
    </div>
  )
}

function ChapterList({
  chapters,
  book,
  multiSource,
  onMarkSeen,
}: {
  chapters: NovelChapter[]
  book: NovelBook
  multiSource: boolean
  onMarkSeen: () => void
}) {
  const folded = chapters.length > FOLD_THRESHOLD
  const [userExpanded, setUserExpanded] = useState(false)
  const isFolded = folded && !userExpanded
  const displayChapters = isFolded ? chapters.slice(0, 2) : chapters
  const totalCount = chapters.reduce((sum, c) => sum + (c.omittedCount ?? 1), 0)
  const displayCount = displayChapters.reduce((sum, c) => sum + (c.omittedCount ?? 1), 0)
  const hiddenCount = totalCount - displayCount

  return (
    <>
      <ul class={`gm-sp-list gm-sp-list-col${isFolded ? ' gm-sp-novels-chapters-folded' : ''}`}>
        {displayChapters.map((ch, i) =>
          ch.omittedCount ? (
            <GapItem key={`gap-${i}`} count={ch.omittedCount} />
          ) : (
            <ChapterItem
              key={ch.key}
              chapter={ch}
              book={book}
              multiSource={multiSource}
              onMarkSeen={onMarkSeen}
            />
          ),
        )}
      </ul>
      {folded && (
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

function GapItem({ count }: { count: number }) {
  return (
    <li class="gm-sp-novels-chapter gm-sp-novels-chapter-gap">
      <span class="gm-sp-novels-chapter-gap-text">……省略 {count} 章</span>
    </li>
  )
}

function ChapterItem({
  chapter,
  book: _book,
  multiSource,
  onMarkSeen,
}: {
  chapter: NovelChapter
  book: NovelBook
  multiSource: boolean
  onMarkSeen: () => void
}) {
  const timeText = chapter.postedAt > 0 ? formatPostedAt(chapter.postedAt) : FALLBACK_DATE_LABEL

  if (!multiSource) {
    const href = escapeUrl(variantUrl(chapter.variants[0]!))
    return (
      <li class="gm-sp-novels-chapter">
        <a
          class="gm-sp-novels-chapter-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onMarkSeen()}
        >
          <span class="gm-sp-novels-chapter-time">{timeText}</span>
          <span class="gm-sp-novels-chapter-title">{chapter.title}</span>
        </a>
      </li>
    )
  }

  return (
    <li class="gm-sp-novels-chapter gm-sp-novels-chapter-multi">
      <span class="gm-sp-novels-chapter-time">{timeText}</span>
      <span class="gm-sp-novels-chapter-title">{chapter.title}</span>
      <span class="gm-sp-novels-chapter-sources">
        {chapter.variants.map((v) => (
          <ChapterSourceChip key={v.url} variant={v} onMarkSeen={onMarkSeen} />
        ))}
      </span>
    </li>
  )
}

function ChapterSourceChip({
  variant,
  onMarkSeen,
}: {
  variant: NovelChapterVariant
  onMarkSeen: () => void
}) {
  const href = escapeUrl(variantUrl(variant))
  const label = sourceLabel(variant.url)
  return (
    <a
      class="gm-sp-novels-chapter-src"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={variant.host ?? variant.url}
      onClick={() => onMarkSeen()}
    >
      {label}
    </a>
  )
}

function ReadChapterItem({
  chapter,
  book,
  multiSource,
}: {
  chapter: NovelChapter
  book: NovelBook
  multiSource: boolean
}) {
  const timeText = formatPostedAt(chapter.postedAt || book.fetchedAt) + '【已读】'
  if (!multiSource) {
    const href = escapeUrl(variantUrl(chapter.variants[0]!))
    return (
      <li class="gm-sp-novels-chapter">
        <a class="gm-sp-novels-chapter-link" href={href} target="_blank" rel="noopener noreferrer">
          <span class="gm-sp-novels-chapter-time">{timeText}</span>
          <span class="gm-sp-novels-chapter-title">{chapter.title}</span>
        </a>
      </li>
    )
  }
  return (
    <li class="gm-sp-novels-chapter gm-sp-novels-chapter-multi">
      <span class="gm-sp-novels-chapter-time">{timeText}</span>
      <span class="gm-sp-novels-chapter-title">{chapter.title}</span>
      <span class="gm-sp-novels-chapter-sources">
        {chapter.variants.map((v) => (
          <ChapterSourceChip key={v.url} variant={v} onMarkSeen={() => {}} />
        ))}
      </span>
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
