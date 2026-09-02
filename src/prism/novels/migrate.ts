import type { NovelBook, NovelChapter, NovelChapterVariant, NovelSourceState } from './types'
import { chapterKey } from './chapter-key'

/** Stable book identity, decoupled from the display title. */
export function bookId(url: string): string {
  return `u:${url}`
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isMigrated(raw: unknown): raw is NovelBook {
  return (
    isPlainObject(raw) &&
    typeof raw.id === 'string' &&
    Array.isArray(raw.latestChapters) &&
    Array.isArray(raw.sources)
  )
}

/**
 * Upgrade any cached `NovelBook` to the current multi-source shape. Already
 * migrated books are returned as-is (idempotent). Books without a usable url
 * yield undefined and are dropped by `normalizeBooks`.
 */
export function normalizeBook(raw: unknown): NovelBook | undefined {
  if (!isPlainObject(raw)) return undefined
  if (isMigrated(raw)) return raw as NovelBook

  const url = str(raw.url)
  if (!url) return undefined

  const siteId = str(raw.siteId)
  const mirrorHost = typeof raw.mirrorHost === 'string' ? raw.mirrorHost : undefined
  const title = str(raw.title)
  const lastSeenUrl = str(raw.lastSeenChapterUrl)

  const legacyChapters = Array.isArray(raw.latestChapters)
    ? (raw.latestChapters as Record<string, unknown>[])
    : []
  const chapters: NovelChapter[] = legacyChapters.map((c) => {
    if (num(c.omittedCount) > 0) {
      return { key: '', title: '', postedAt: 0, variants: [], omittedCount: num(c.omittedCount) }
    }
    const cUrl = str(c.url)
    const cTitle = str(c.title)
    const variant: NovelChapterVariant = {
      url: cUrl,
      title: cTitle,
      postedAt: num(c.postedAt),
      siteId,
      host: mirrorHost,
    }
    return {
      key: chapterKey(cTitle),
      title: cTitle,
      postedAt: variant.postedAt,
      variants: [variant],
    }
  })

  const error = str(raw.error)
  const source: NovelSourceState = {
    url,
    siteId,
    mirrorHost,
    chapterCount: 0,
    error,
  }

  return {
    id: bookId(url),
    title,
    sources: [source],
    latestChapters: chapters,
    lastSeenChapterKey: deriveSeenKey(legacyChapters, lastSeenUrl),
    fetchedAt: num(raw.fetchedAt) || Date.now(),
    error,
  }
}

/** Map a legacy `lastSeenChapterUrl` to its chapter key via the chapter title. */
export function deriveSeenKey(chapters: Record<string, unknown>[], seenUrl: string): string {
  if (!seenUrl) return ''
  const seen = chapters.find((c) => str(c.url) === seenUrl)
  if (!seen) return ''
  return chapterKey(str(seen.title))
}

export function normalizeBooks(raw: unknown): NovelBook[] {
  if (!Array.isArray(raw)) return []
  const out: NovelBook[] = []
  for (const item of raw) {
    const book = normalizeBook(item)
    if (book) out.push(book)
  }
  return out
}
