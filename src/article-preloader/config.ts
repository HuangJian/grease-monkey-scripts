import type { DirectSelectorConfig, TextPatternConfig, SiteConfig } from './types'

export type { DirectSelectorConfig, TextPatternConfig, SiteConfig }

export const SITE_CONFIGS: SiteConfig[] = [
  {
    kind: 'direct',
    host: 'biduoxs.com',
    previousChapterLinkSelector: '.bottem2 a:nth-child(1)',
    indexLinkSelector: '.bottem2 a:nth-child(2)',
    nextChapterLinkSelector: '.bottem2 a:nth-child(3)',
  },
  {
    kind: 'direct',
    host: 'xbiquge.so',
    previousChapterLinkSelector: '#link-preview',
    indexLinkSelector: '#link-index',
    nextChapterLinkSelector: '#link-next',
    contentSelector: '#content',
  },
  {
    kind: 'text',
    host: ['sudugu.org', 'shudugu.org'],
    chapterLinkSelector: '.prenext a',
    contentSelector: '.con',
    previousChapterTextPattern: /上一章|上一页/,
    nextChapterTextPattern: /下一章/,
    continuationPageTextPattern: /下一页|下页|下一页继续阅读/,
    indexPageTextPattern: /目录|书页|章节目录/,
  },
  {
    kind: 'text',
    host: 'tongrenxsw.com',
    chapterLinkSelector: '.btnW a',
    contentSelector: '.content',
    previousChapterTextPattern: /上一章|上一页/,
    nextChapterTextPattern: /下一章/,
    continuationPageTextPattern: /下一页|下页/,
    indexPageTextPattern: /目录|章节目录/,
  },
]
