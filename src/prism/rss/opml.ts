/**
 * OPML 2.0 serialization for the RSS subscription list.
 *
 * Pure module: no `Runtime`, no DOM globals — the parser takes the same
 * `DOMParser` every other feed parser receives, so it stays unit-testable.
 */
import { escapeHtml } from '../../utils'
import type { RssFeedConfig } from './types'

const OPML_DOCUMENT_TITLE = 'Prism RSS subscriptions'
const BOM = /^﻿/

/** Build an OPML 2.0 document for the given feeds. */
export function buildOpml(feeds: ReadonlyArray<RssFeedConfig>): string {
  const outlines = feeds
    .map((feed) => {
      const text = escapeHtml(feed.title || feed.url)
      return `    <outline type="rss" text="${text}" title="${text}" xmlUrl="${escapeHtml(feed.url)}"/>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>${OPML_DOCUMENT_TITLE}</title>
  </head>
  <body>
${outlines}
  </body>
</opml>
`
}

/** Attribute lookup that tolerates the `xmlurl` / `XMLURL` spellings found in the wild. */
function attrByLowerName(el: Element, name: string): string {
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.toLowerCase() === name) return attr.value
  }
  return ''
}

function isUsableUrl(url: string): boolean {
  try {
    void new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Read every feed URL out of an OPML document.
 *
 * Category folders (`<outline>` without `xmlUrl`) are ignored and their nested
 * entries are flattened — v1 has no folder model. Unparseable URLs are dropped
 * (the config validator would reject them anyway). Returns an empty array for
 * empty or malformed input instead of throwing.
 */
export function parseOpml(xml: string, domParser: DOMParser): RssFeedConfig[] {
  if (!xml) return []
  const doc = domParser.parseFromString(xml.replace(BOM, ''), 'text/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) return []

  const feeds: RssFeedConfig[] = []
  const seen = new Set<string>()
  for (const el of Array.from(doc.getElementsByTagName('outline'))) {
    const url = attrByLowerName(el, 'xmlurl').trim()
    if (!url || seen.has(url) || !isUsableUrl(url)) continue
    seen.add(url)
    const label = (attrByLowerName(el, 'text') || attrByLowerName(el, 'title')).trim()
    // `text` is mandatory in OPML, so exporters (including ours) put the URL
    // there when no title exists. Treating that as a custom title would shadow
    // the feed's own title, so keep it empty.
    feeds.push({ url, title: label === url ? '' : label })
  }
  return feeds
}

export type ImportOutcome = {
  feeds: RssFeedConfig[]
  added: number
  skipped: number
}

/**
 * Merge imported feeds into the current list, keyed by URL.
 *
 * Imported entries never overwrite an existing feed's custom title; duplicates
 * inside the imported file itself count as skipped too, so the reported numbers
 * always add up to the file's entry count.
 */
export function mergeImportedFeeds(
  current: ReadonlyArray<RssFeedConfig>,
  imported: ReadonlyArray<RssFeedConfig>,
): ImportOutcome {
  const feeds = current.map((f) => ({ ...f }))
  const known = new Set(current.map((f) => f.url))
  let added = 0
  let skipped = 0
  for (const feed of imported) {
    if (known.has(feed.url)) {
      skipped++
      continue
    }
    known.add(feed.url)
    feeds.push({ ...feed })
    added++
  }
  return { feeds, added, skipped }
}
