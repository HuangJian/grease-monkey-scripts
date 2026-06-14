/**
 * Novels editor types and constants.
 */
import type { NovelSourceOptions, NovelEntry } from '../types'

export type NovelsEditorOptions = NovelSourceOptions & {
  getCachedTitles: () => Promise<Map<string, string>>
}

export const ADVANCED_FIELDS: {
  prop: string
  label: string
  min: number
  errorMsg: string
}[] = [
  { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
  {
    prop: 'initialNewChapters',
    label: '初始新章数',
    min: 0,
    errorMsg: '初始新章数必须是 ≥0 的整数',
  },
  {
    prop: 'maxNewChaptersPerBook',
    label: '折叠阈值',
    min: 1,
    errorMsg: '折叠阈值必须是 ≥1 的整数',
  },
  { prop: 'maxLatestWindow', label: '章节窗口', min: 1, errorMsg: '章节窗口必须是 ≥1 的整数' },
]

export function coerceNovelsOptions(
  raw: Record<string, unknown>,
  fallback: NovelSourceOptions,
): NovelSourceOptions {
  const entries = raw['entries']
  return {
    entries: Array.isArray(entries) ? (entries as NovelEntry[]) : fallback.entries,
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    maxNewChaptersPerBook:
      typeof raw['maxNewChaptersPerBook'] === 'number'
        ? (raw['maxNewChaptersPerBook'] as number)
        : fallback.maxNewChaptersPerBook,
    initialNewChapters:
      typeof raw['initialNewChapters'] === 'number'
        ? (raw['initialNewChapters'] as number)
        : fallback.initialNewChapters,
    maxLatestWindow:
      typeof raw['maxLatestWindow'] === 'number'
        ? (raw['maxLatestWindow'] as number)
        : fallback.maxLatestWindow,
  }
}
