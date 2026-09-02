import type { NovelRawChapter } from '../types'

export type ParsedHome = {
  title: string | null
  /** Latest 3 chapters with timestamps from itemtxt (for overlay). */
  latestThree: NovelRawChapter[]
  /** All chapters from #list on the home page (newest-first), empty if no #list. */
  homeChapters: NovelRawChapter[]
  lastPageNumber: number
}

export type NovelAdapter = {
  readonly id: string
  readonly hostnames: ReadonlyArray<string>
  parseHome(html: string, pageUrl: string, domParser: DOMParser, now?: number): ParsedHome
  parseChapterList(html: string, pageUrl: string, domParser: DOMParser): NovelRawChapter[]
  buildTailUrl(homeUrl: string, pageNumber: number): string
}
