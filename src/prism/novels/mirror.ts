import type { NovelBook } from './types'

/**
 * Rewrite `url`'s host to the book's last-working mirror host when one is known.
 * Keeps the path/query so chapter and book links point at the mirror that actually
 * served the content, while the canonical (entry) URL stays the book's identity.
 */
export function displayUrl(book: Pick<NovelBook, 'mirrorHost'>, url: string): string {
  if (!book.mirrorHost) return url
  try {
    const u = new URL(url)
    u.hostname = book.mirrorHost
    return u.href
  } catch {
    return url
  }
}
