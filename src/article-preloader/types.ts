export type DirectSelectorConfig = {
  kind: 'direct'
  host: string | string[]
  contentSelector?: string | undefined
  previousChapterLinkSelector: string
  indexLinkSelector: string
  nextChapterLinkSelector: string
}

export type TextPatternConfig = {
  kind: 'text'
  host: string | string[]
  contentSelector?: string | undefined
  chapterLinkSelector: string
  previousChapterTextPattern: RegExp
  nextChapterTextPattern: RegExp
  continuationPageTextPattern: RegExp
  indexPageTextPattern: RegExp
}

export type SiteConfig = DirectSelectorConfig | TextPatternConfig

export type Selectors = {
  previousChapterLinkSelector: () => Element | null
  indexLinkSelector: () => Element | null
  nextChapterLinkSelector: () => Element | null
  contentSelector?: string | undefined
  paginationSelector: string
  matchContinuationText: (text: string) => boolean
  matchNextChapterText: (text: string) => boolean
}

export type ChapterResult = {
  html: string
  url: string
  nextChapterUrl: string
}
