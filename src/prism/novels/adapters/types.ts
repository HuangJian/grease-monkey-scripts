import type { NovelRawChapter } from '../types'

export type ParsedHome = {
  title: string | null
  /** Latest 3 chapters with timestamps from itemtxt (for overlay). */
  latestThree: NovelRawChapter[]
  /** All chapters from #list on the home page (newest-first), empty if no #list. */
  homeChapters: NovelRawChapter[]
  lastPageNumber: number
}

/**
 * A parser for one page structure. There is no hostname or site id here on
 * purpose: sites rotate domains, so recognition belongs to `detect.ts` and
 * identity to the configured URL, not to a registry entry.
 */
export type NovelAdapter = {
  parseHome(html: string, pageUrl: string, domParser: DOMParser, now?: number): ParsedHome
  parseChapterList(html: string, pageUrl: string, domParser: DOMParser): NovelRawChapter[]
  buildTailUrl(homeUrl: string, pageNumber: number): string
}
