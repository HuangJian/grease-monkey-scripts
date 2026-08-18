import { getLinkText, matchesText } from '../utils'
import { SITE_CONFIGS } from './config'
import type { Selectors } from './types'

export function findChapterLink(
  linkSelector: string,
  matchers: Array<RegExp | ((text: string) => boolean)>,
  doc: Document,
): Element | null {
  const links = Array.from(doc.querySelectorAll(linkSelector))
  for (const matcher of matchers) {
    const link = links.find((item) => matchesText(matcher, getLinkText(item)))
    if (link) return link
  }
  return null
}

export function selectorsFactory(host: string, doc: Document): Selectors {
  const config = SITE_CONFIGS.find((c) => {
    const hosts = Array.isArray(c.host) ? c.host : [c.host]
    return hosts.some((h) => host.includes(h))
  })
  if (!config) throw new Error(`Unsupported website: ${host}`)

  if (config.kind === 'text') {
    return {
      previousChapterLinkSelector: () =>
        findChapterLink(config.chapterLinkSelector, [config.previousChapterTextPattern], doc),
      indexLinkSelector: () =>
        findChapterLink(config.chapterLinkSelector, [config.indexPageTextPattern], doc),
      nextChapterLinkSelector: () =>
        findChapterLink(
          config.chapterLinkSelector,
          [config.nextChapterTextPattern, config.continuationPageTextPattern],
          doc,
        ),
      contentSelector: config.contentSelector,
      paginationSelector: config.chapterLinkSelector,
      matchContinuationText: (text) => config.continuationPageTextPattern.test(text),
      matchNextChapterText: (text) => config.nextChapterTextPattern.test(text),
    }
  }

  return {
    previousChapterLinkSelector: () => doc.querySelector(config.previousChapterLinkSelector),
    indexLinkSelector: () => doc.querySelector(config.indexLinkSelector),
    nextChapterLinkSelector: () => doc.querySelector(config.nextChapterLinkSelector),
    contentSelector: config.contentSelector,
    paginationSelector: 'a',
    matchContinuationText: () => false,
    matchNextChapterText: () => false,
  }
}
