/**
 * Novels editor types and constants.
 */
import { numberOrDefault } from '../../../utils'
import type { NumberFieldDef } from '../../editor-helpers'
import type { NovelSourceOptions, NovelEntry } from '../types'

export type NovelsEditorOptions = NovelSourceOptions & {
  getCachedTitles: () => Promise<Map<string, string>>
}

export const ADVANCED_FIELDS: NumberFieldDef[] = [
  { prop: 'ttlMinutes', name: 'TTL', unit: '分钟', min: 1, integer: true },
  { prop: 'initialNewChapters', name: '初始新章数', min: 0, integer: true },
  { prop: 'maxNewChaptersPerBook', name: '折叠阈值', min: 1, integer: true },
  { prop: 'maxLatestWindow', name: '章节窗口', min: 1, integer: true },
]

export function coerceNovelsOptions(
  raw: Record<string, unknown>,
  fallback: NovelSourceOptions,
): NovelSourceOptions {
  const entries = raw['entries']
  return {
    entries: Array.isArray(entries) ? (entries as NovelEntry[]) : fallback.entries,
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    maxNewChaptersPerBook: numberOrDefault(
      raw['maxNewChaptersPerBook'],
      fallback.maxNewChaptersPerBook,
    ),
    initialNewChapters: numberOrDefault(raw['initialNewChapters'], fallback.initialNewChapters),
    maxLatestWindow: numberOrDefault(raw['maxLatestWindow'], fallback.maxLatestWindow),
  }
}
