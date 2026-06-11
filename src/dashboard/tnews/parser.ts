import { TITLE_FALLBACK_MAX_CHARS } from './constants'
import type { TnewsItem } from './types'

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'a',
  'b',
  'i',
  'em',
  'strong',
  'code',
  'pre',
  'blockquote',
  'ul',
  'ol',
  'li',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'figure',
  'figcaption',
  'img',
])

const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'link',
  'meta',
  'form',
  'input',
  'button',
  'base',
  'frame',
  'frameset',
  'noscript',
  'template',
  'slot',
  'video',
  'audio',
  'source',
  'track',
])

const DANGEROUS_HREF_PREFIXES = /^\s*(javascript|data|vbscript):/i

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
  const linkEl = item.getElementsByTagName('link')[0]
  const link = textOf(linkEl)
  if (!link) return null

  const guid = textOf(item.getElementsByTagName('guid')[0]) || link
  const rawTitle = textOf(item.getElementsByTagName('title')[0])
  const descriptionRaw = textOf(item.getElementsByTagName('description')[0])
  const pubDate = parsePubDateMs(textOf(item.getElementsByTagName('pubDate')[0]))

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
  const out: Element[] = []
  for (let i = 0; i < items.length; i++) {
    const el = items[i]
    if (el) out.push(el)
  }
  return out
}

export function parseRssItems(xml: string, domParser: DOMParser): TnewsItem[] {
  if (!xml || !xml.trim()) return []
  const itemEls = parseItemsFromXml(xml, domParser)
  const out: TnewsItem[] = []
  for (const el of itemEls) {
    const parsed = parseItem(el, domParser)
    if (parsed) out.push(parsed)
  }
  return out
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
  if (!html) return ''
  const doc = domParser.parseFromString(`<div id="__gm_tnews_root">${html}</div>`, 'text/html')
  const root = doc.getElementById('__gm_tnews_root')
  if (!root) return ''
  sanitizeNode(root)
  return root.innerHTML
}

function sanitizeNode(node: Element): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) {
      sanitizeNode(child as Element)
    }
  }
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType !== 1) continue
    const el = child as Element
    const tag = el.tagName.toLowerCase()
    if (BLOCKED_TAGS.has(tag)) {
      node.removeChild(el)
      continue
    }
    if (!ALLOWED_TAGS.has(tag)) {
      const parent = el.parentNode
      if (!parent) continue
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el)
      }
      parent.removeChild(el)
      continue
    }
    sanitizeAttrs(el, tag)
    if (
      tag === 'img' &&
      el.hasAttribute('src') &&
      el.parentNode &&
      (el.parentNode as Element).tagName?.toLowerCase() !== 'a'
    ) {
      const src = el.getAttribute('src')!
      const anchor = el.ownerDocument!.createElement('a')
      anchor.setAttribute('href', src)
      anchor.setAttribute('target', '_blank')
      anchor.setAttribute('rel', 'noopener noreferrer')
      el.parentNode.replaceChild(anchor, el)
      anchor.appendChild(el)
    }
  }
}

function sanitizeAttrs(el: Element, tag: string): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
      el.removeAttribute(attr.name)
      continue
    }
    if (tag === 'a' && name === 'href') {
      if (DANGEROUS_HREF_PREFIXES.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
    if (tag === 'img') {
      if (name === 'width' || name === 'height') {
        el.removeAttribute(attr.name)
        continue
      }
      if (name === 'src' && DANGEROUS_HREF_PREFIXES.test(attr.value)) {
        el.removeAttribute(attr.name)
      }
    }
  }
  if (tag === 'a' && el.hasAttribute('href')) {
    el.setAttribute('target', '_blank')
    el.setAttribute('rel', 'noopener noreferrer')
  }
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
  for (const item of a) {
    byKey.set(item.link, item)
  }
  for (const item of b) {
    const existing = byKey.get(item.link)
    if (!existing) {
      byKey.set(item.link, item)
      continue
    }
    if (item.pubDate > existing.pubDate) {
      byKey.set(item.link, item)
    }
  }
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
