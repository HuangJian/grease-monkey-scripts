import { sanitizeHtml as sharedSanitizeHtml } from '../shared/sanitize'
import { TITLE_FALLBACK_MAX_CHARS } from './constants'
import type { TnewsItem } from './types'

function textOf(el: Element | null): string {
  if (!el) return ''
  return (el.textContent ?? '').trim()
}

function isParserError(doc: Document): boolean {
  return doc.getElementsByTagName('parsererror').length > 0
}

function parsePubDateMs(raw: string | undefined): number {
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

function parseItem(item: Element, domParser: DOMParser): TnewsItem | null {
  const linkEl = item.getElementsByTagName('link')[0] ?? null
  const link = textOf(linkEl)
  if (!link) return null

  const guid = textOf(item.getElementsByTagName('guid')[0] ?? null) || link
  const rawTitle = textOf(item.getElementsByTagName('title')[0] ?? null)
  const descriptionRaw = textOf(item.getElementsByTagName('description')[0] ?? null)
  const pubDate = parsePubDateMs(textOf(item.getElementsByTagName('pubDate')[0] ?? null))

  if (!pubDate) return null

  const descriptionHtml = sanitizeHtml(descriptionRaw, domParser)
  const title = extractTitle(rawTitle, descriptionHtml, domParser)
  const id = normalizeLink(link) || guid

  return {
    id,
    title,
    link: normalizeLink(link) || link,
    pubDate,
    descriptionHtml,
  }
}

function parseItemsFromXml(xml: string, domParser: DOMParser): Element[] {
  const doc = domParser.parseFromString(xml, 'text/xml')
  if (isParserError(doc)) return []
  const items = doc.getElementsByTagName('item')
  return Array.from(items).filter((el): el is Element => el !== null)
}

export function parseRssItems(xml: string, domParser: DOMParser): TnewsItem[] {
  if (!xml || !xml.trim()) return []
  const itemEls = parseItemsFromXml(xml, domParser)
  return itemEls.reduce<TnewsItem[]>((out, el) => {
    const parsed = parseItem(el, domParser)
    if (parsed) out.push(parsed)
    return out
  }, [])
}

export function extractTitle(
  rawTitle: string,
  fallbackHtml: string,
  domParser: DOMParser,
  maxChars: number = TITLE_FALLBACK_MAX_CHARS,
): string {
  const t = rawTitle.trim()
  if (t) return t
  const text = stripHtmlToText(fallbackHtml, domParser)
  if (!text) return ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxChars) return collapsed
  return collapsed.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…'
}

export function sanitizeHtml(html: string, domParser: DOMParser): string {
  return sharedSanitizeHtml(html, domParser, { wrapImagesInAnchor: true })
}

export function stripHtmlToText(html: string, domParser: DOMParser): string {
  if (!html) return ''
  const doc = domParser.parseFromString(`<div id="__gm_tnews_root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__gm_tnews_root')
  if (!root) return ''
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim()
}

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

export function mergeByLink(a: ReadonlyArray<TnewsItem>, b: ReadonlyArray<TnewsItem>): TnewsItem[] {
  const byKey = new Map<string, TnewsItem>()
  a.forEach((item) => byKey.set(item.link, item))
  b.forEach((item) => {
    const existing = byKey.get(item.link)
    if (!existing) {
      byKey.set(item.link, item)
      return
    }
    if (item.pubDate > existing.pubDate) {
      byKey.set(item.link, item)
    }
  })
  return Array.from(byKey.values())
}

export function filterByRetention(
  items: ReadonlyArray<TnewsItem>,
  now: number,
  retentionMs: number,
): TnewsItem[] {
  const cutoff = now - retentionMs
  return items.filter((it) => it.pubDate >= cutoff)
}

export function sortByPubDateDesc(items: TnewsItem[]): TnewsItem[] {
  return [...items].sort((a, b) => b.pubDate - a.pubDate)
}
