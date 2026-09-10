/**
 * Feed parsing shared by every source that consumes RSS / Atom / RDF.
 *
 * Extracted from `tnews/parser.ts` so a second consumer (the `rss` source) does
 * not grow its own copy. The parser is intentionally permissive: it keeps items
 * whose date is missing — filtering by date is the caller's policy decision
 * (tnews drops them, the RSS reader keeps them). See `rss-reader.plan.md` D3.
 *
 * All functions are pure: they take a `DOMParser` (from `Runtime.DOMParser`)
 * instead of touching browser globals, so they stay unit-testable.
 */
import { sanitizeHtml as coreSanitizeHtml } from './sanitize'

export type FeedItem = {
  id: string
  title: string
  link: string
  /** Publication timestamp in ms; 0 when the feed does not supply one. */
  pubDate: number
  /** Sanitized summary/body HTML; empty string when absent. */
  summaryHtml: string
  /** Author name when the feed supplies one (RSS author, dc:creator, Atom author/name). */
  author?: string
}

export type FeedParseResult = {
  /** Feed-level title (channel/title or feed/title); empty when absent. */
  title: string
  items: FeedItem[]
}

export type ParseFeedOptions = {
  /** Max length when deriving a title from the body text (default 60). */
  maxTitleChars?: number
  /** Wrap bare `<img>` in an anchor (default true, matching tnews behavior). */
  wrapImagesInAnchor?: boolean
  /**
   * Parse at most this many entries, in document order (default: all).
   *
   * Each entry costs two DOM parses (sanitize + plain-text), so a caller that
   * only keeps the newest N should pass N here rather than pay for thousands of
   * entries it is about to discard. Feeds list newest first, so document order
   * and the caller's cap agree.
   */
  maxItems?: number
}

/** Element children are matched by `localName` so namespace prefixes (`dc:creator`, `content:encoded`) work. */
function childrenByLocalName(parent: Element, name: string): Element[] {
  const target = name.toLowerCase()
  return Array.from(parent.children).filter((child) => child.localName?.toLowerCase() === target)
}

function firstChildByLocalNames(parent: Element, names: readonly string[]): Element | undefined {
  for (const name of names) {
    const match = childrenByLocalName(parent, name)[0]
    if (match) return match
  }
  return undefined
}

function textOfElement(el: Element | undefined | null): string {
  if (!el) return ''
  return (el.textContent ?? '').trim()
}

/** First non-empty value among the given child names, in priority order. */
function firstText(parent: Element, names: readonly string[]): string {
  for (const name of names) {
    const text = textOfElement(childrenByLocalName(parent, name)[0])
    if (text) return text
  }
  return ''
}

const RDF_NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'

/** RSS 1.0 keeps the entry URL in `rdf:about` instead of a `<link>` child. */
function rdfAbout(el: Element): string {
  const namespaced = el.getAttributeNS?.(RDF_NAMESPACE, 'about')
  return (namespaced || el.getAttribute('rdf:about') || '').trim()
}

/**
 * Entry URL. Atom puts it in `href` (several `<link>` siblings, the readable
 * one being `rel="alternate"`); RSS puts it in the element text.
 */
function entryLink(el: Element): string {
  let fallback = ''
  for (const linkEl of childrenByLocalName(el, 'link')) {
    const value = ((linkEl.getAttribute('href') ?? '').trim() || textOfElement(linkEl)) as string
    if (!value) continue
    if ((linkEl.getAttribute('rel') ?? '').trim() === 'alternate') return value
    if (!fallback) fallback = value
  }
  return fallback || rdfAbout(el)
}

function entryAuthor(el: Element): string {
  const authorEl = childrenByLocalName(el, 'author')[0]
  // Atom nests the name in <author><name>; RSS/DC put the value in the text itself.
  if (authorEl) {
    const name = firstText(authorEl, ['name'])
    if (name) return name
  }
  const creator = firstText(el, ['creator'])
  return creator || textOfElement(authorEl)
}

function isParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0
}

function toElements(nodes: HTMLCollectionOf<Element> | ArrayLike<Element>): Element[] {
  return Array.from(nodes).filter((el): el is Element => el !== null)
}

const DATE_FIELDS = ['pubDate', 'published', 'updated', 'date', 'modified'] as const

function entryPubDate(el: Element): number {
  return parsePubDateMs(firstText(el, DATE_FIELDS) || undefined)
}

/**
 * Choose which entries to convert. With `maxItems` set, keep the newest by
 * publish date and drop the rest before any DOM sanitizing happens — every
 * entry costs two DOM parses, and a caller that caps to N would pay for
 * thousands of entries it is about to discard.
 *
 * Sorting first (rather than slicing document order) matters: the entries a
 * caller's own cap would keep are the newest ones, not the first ones in the
 * document. Ties keep document order, which is restored before returning so the
 * result stays stable for the caller.
 */
function selectEntries(entries: Element[], maxItems: number | undefined): Element[] {
  if (maxItems === undefined) return entries
  const limit = Math.max(0, maxItems)
  if (entries.length <= limit) return entries
  return entries
    .map((el, index) => ({ el, index, pubDate: entryPubDate(el) }))
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((candidate) => candidate.el)
}

function descendantsByLocalName(root: Element, name: string): Element[] {
  const target = name.toLowerCase()
  return Array.from(root.querySelectorAll('*')).filter(
    (el) => el.localName?.toLowerCase() === target,
  )
}

/**
 * RSS/RDF use `<item>`, Atom uses `<entry>`. A feed uses one or the other, never both.
 *
 * `getElementsByTagName` compares the qualified name, which misses a
 * namespace-prefixed `<rss:item>`; fall back to matching on localName so entry
 * lookup is as permissive as the child lookups above.
 */
function collectEntries(doc: Document): Element[] {
  const legacy = toElements(doc.getElementsByTagName('item'))
  if (legacy.length > 0) return legacy
  const entries = toElements(doc.getElementsByTagName('entry'))
  if (entries.length > 0) return entries
  const root = doc.documentElement
  if (!root) return []
  for (const name of ['item', 'entry']) {
    const found = descendantsByLocalName(root, name)
    if (found.length > 0) return found
  }
  return []
}

function feedTitleOf(doc: Document): string {
  const container = firstChildByLocalNames(doc.documentElement, ['channel', 'feed'])
  const raw = firstText(container ?? doc.documentElement, ['title'])
  return raw
}

/** Parse a date label; 0 when missing or unparseable. Handles RFC 822 / ISO 8601 / Atom variants. */
export function parsePubDateMs(raw: string | undefined): number {
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

function parseEntry(el: Element, domParser: DOMParser, options: ParseFeedOptions): FeedItem | null {
  const link = entryLink(el)
  if (!link) return null

  const pubDate = entryPubDate(el)
  const summaryRaw = firstText(el, ['description', 'encoded', 'content', 'summary'])
  const summaryHtml = summaryRaw
    ? sanitizeFeedHtml(summaryRaw, domParser, options.wrapImagesInAnchor)
    : ''
  const rawTitle = firstText(el, ['title'])
  const title = extractTitle(rawTitle, summaryHtml, domParser, options.maxTitleChars)
  const author = entryAuthor(el)
  const normalized = normalizeLink(link)

  return {
    // Identity is the canonical link, not the guid: guids change when a feed is
    // regenerated, while the link stays stable. `guid` is not used as a fallback
    // because `normalizeLink` never returns empty for the non-empty link that
    // this entry was required to have.
    id: normalized,
    title,
    link: normalized,
    pubDate,
    summaryHtml,
    ...(author ? { author } : {}),
  }
}

/**
 * Parse a feed document into its title and entries.
 *
 * Returns an empty result (never throws) for empty input, malformed XML, or a
 * document the DOM parser rejects — callers must not have to guard this.
 */
export function parseFeed(
  xml: string,
  domParser: DOMParser,
  options: ParseFeedOptions = {},
): FeedParseResult {
  if (!xml || !xml.trim()) return { title: '', items: [] }
  const doc = domParser.parseFromString(xml, 'text/xml')
  if (isParserError(doc)) return { title: '', items: [] }

  const items: FeedItem[] = []
  for (const el of selectEntries(collectEntries(doc), options.maxItems)) {
    const parsed = parseEntry(el, domParser, options)
    if (parsed) items.push(parsed)
  }
  return { title: feedTitleOf(doc), items }
}

const DEFAULT_TITLE_FALLBACK_MAX_CHARS = 60

/** Keep the raw title; when empty, derive one from the sanitized body text. */
export function extractTitle(
  rawTitle: string,
  fallbackHtml: string,
  domParser: DOMParser,
  maxChars: number = DEFAULT_TITLE_FALLBACK_MAX_CHARS,
): string {
  const t = rawTitle.trim()
  if (t) return t
  const text = stripHtmlToText(fallbackHtml, domParser)
  if (!text) return ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxChars) return collapsed
  return collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

/** Whitelist-sanitized HTML for feed bodies. Defaults to wrapping bare images in an anchor. */
export function sanitizeFeedHtml(
  html: string,
  domParser: DOMParser,
  wrapImagesInAnchor: boolean = true,
): string {
  return coreSanitizeHtml(html, domParser, { wrapImagesInAnchor })
}

export function stripHtmlToText(html: string, domParser: DOMParser): string {
  if (!html) return ''
  const doc = domParser.parseFromString(`<div id="__gm_feed_root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__gm_feed_root')
  if (!root) return ''
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** Canonicalize a feed entry URL so the same article is not counted twice. */
export function normalizeLink(url: string): string {
  try {
    const u = new URL(url)
    u.hostname = u.hostname.toLowerCase()
    u.hash = ''
    let path = u.pathname
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
    u.pathname = path
    return u.toString()
  } catch {
    return url
  }
}
