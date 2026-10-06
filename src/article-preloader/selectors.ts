import { getLinkText, matchesText } from '../utils'
import { SITE_CONFIGS } from './config'
import type { Selectors, SiteConfig } from './types'

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

function hostsOf(config: SiteConfig): string[] {
  return Array.isArray(config.host) ? config.host : [config.host]
}

/** Every selector of the site's DOM signature must be present. */
function matchesStructure(doc: Document, config: SiteConfig): boolean {
  const needed = Array.isArray(config.detect) ? config.detect : [config.detect]
  return needed.every((selector) => doc.querySelector(selector) !== null)
}

/**
 * Resolve the site config for a page.
 *
 * Known hosts win: it is deterministic and the only route on pages that lack
 * the chapter markup. Otherwise fall back to the DOM signature, so a site that
 * moves to a brand-new domain keeps working without any code change.
 */
export function findSiteConfig(host: string, doc: Document): SiteConfig | undefined {
  return (
    SITE_CONFIGS.find((c) => hostsOf(c).some((h) => host.includes(h))) ??
    SITE_CONFIGS.find((c) => matchesStructure(doc, c))
  )
}

export function selectorsFactory(host: string, doc: Document): Selectors {
  const config = findSiteConfig(host, doc)
  if (!config) throw new Error(`Unsupported website: ${host}`)
  return selectorsFromConfig(config, doc)
}

/** Build selectors from an already-resolved site config. */
export function selectorsFromConfig(config: SiteConfig, doc: Document): Selectors {
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
