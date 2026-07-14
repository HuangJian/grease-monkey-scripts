import type { NovelChapter } from '../types'

export type ParsedHome = {
  title: string | null
  /** Latest 3 chapters with timestamps from itemtxt (for overlay). */
  latestThree: NovelChapter[]
  /** All chapters from #list on the home page (newest-first), empty if no #list. */
  homeChapters: NovelChapter[]
  lastPageNumber: number
}

export type NovelAdapter = {
  readonly id: string
  readonly hostnames: ReadonlyArray<string>
  parseHome(html: string, pageUrl: string, domParser: DOMParser, now?: number): ParsedHome
  parseChapterList(html: string, pageUrl: string, domParser: DOMParser): NovelChapter[]
  buildTailUrl(homeUrl: string, pageNumber: number): string
}
