/**
 * Novels editor types and constants.
 */
import { numberOrDefault } from '../../../utils'
import type { NumberFieldDef } from '../../editor-helpers'
import type { NovelSourceOptions, NovelBookConfig } from '../types'

export type NovelsEditorOptions = NovelSourceOptions & {
  getCachedTitles: () => Promise<Map<string, string>>
}

export const ADVANCED_FIELDS: NumberFieldDef[] = [
  { prop: 'ttlMinutes', name: 'TTL', unit: '分钟', min: 1, integer: true },
  { prop: 'initialNewChapters', name: '初始新章数', min: 0, integer: true },
  { prop: 'maxNewChaptersPerBook', name: '折叠阈值', min: 1, integer: true },
  { prop: 'maxLatestWindow', name: '章节窗口', min: 1, integer: true },
]

function sanitizeBook(raw: unknown): NovelBookConfig | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const urls = Array.isArray(record['urls'])
    ? record['urls'].filter((u): u is string => typeof u === 'string' && u.trim() !== '')
    : []
  if (urls.length === 0) return undefined
  return { title: typeof record['title'] === 'string' ? record['title'] : '', urls }
}

/** Legacy `entries` (one flat entry per url) becomes one single-source book each. */
function booksFromLegacyEntries(raw: unknown): NovelBookConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const books: NovelBookConfig[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    const url = record['url']
    if (typeof url !== 'string' || !url) continue
    books.push({ title: typeof record['alias'] === 'string' ? record['alias'] : '', urls: [url] })
  }
  return books
}

/** Reads the configured books, upgrading a pre-multi-source `entries` section. */
export function coerceNovelBooks(
  section: Record<string, unknown> | null | undefined,
  fallback: NovelBookConfig[],
): NovelBookConfig[] {
  const books = Array.isArray(section?.['books'])
    ? (section!['books'] as unknown[]).map(sanitizeBook).filter((b): b is NovelBookConfig => !!b)
    : undefined
  if (books && books.length > 0) return books

  const legacy = booksFromLegacyEntries(section?.['entries'])
  if (legacy && legacy.length > 0) return legacy

  return fallback
}

export function coerceNovelsOptions(
  raw: Record<string, unknown>,
  fallback: NovelSourceOptions,
): NovelSourceOptions {
  return {
    books: coerceNovelBooks(raw, fallback.books),
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    maxNewChaptersPerBook: numberOrDefault(
      raw['maxNewChaptersPerBook'],
      fallback.maxNewChaptersPerBook,
    ),
    initialNewChapters: numberOrDefault(raw['initialNewChapters'], fallback.initialNewChapters),
    maxLatestWindow: numberOrDefault(raw['maxLatestWindow'], fallback.maxLatestWindow),
  }
}
