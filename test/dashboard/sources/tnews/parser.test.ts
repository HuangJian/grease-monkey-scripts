import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  extractTitle,
  filterByRetention,
  mergeByLink,
  normalizeLink,
  parseRssItems,
  sanitizeHtml,
  sortByPubDateDesc,
  stripHtmlToText,
} from '../../../../src/dashboard/tnews/parser'
import type { TnewsItem } from '../../../../src/dashboard/tnews/types'

function loadFixture(): string {
  return readFileSync(join(import.meta.dir, '..', '..', 'fixtures', 'tnews-sample.xml'), 'utf8')
}

const dom = new JSDOM('<!doctype html><html><body></body></html>')
const domParser: DOMParser = new dom.window.DOMParser() as unknown as DOMParser

describe('normalizeLink', () => {
  test('lowercases host', () => {
    expect(normalizeLink('https://T.ME/tnews365/100')).toBe('https://t.me/tnews365/100')
  })
  test('drops fragment', () => {
    expect(normalizeLink('https://t.me/x/1#frag')).toBe('https://t.me/x/1')
  })
  test('removes trailing slash from non-root path', () => {
    expect(normalizeLink('https://t.me/x/1/')).toBe('https://t.me/x/1')
  })
  test('keeps root slash', () => {
    expect(normalizeLink('https://t.me/')).toBe('https://t.me/')
  })
  test('returns input when URL is invalid', () => {
    expect(normalizeLink('not a url')).toBe('not a url')
  })
})

describe('parseRssItems', () => {
  test('parses 3 valid items from fixture (4th has guid but valid; all 4 actually parse)', () => {
    const items = parseRssItems(loadFixture(), domParser)
    expect(items.length).toBe(4)
  })
  test('item fields are extracted correctly', () => {
    const items = parseRssItems(loadFixture(), domParser)
    const first = items.find((it) => it.id.includes('/100'))!
    expect(first.title).toBe('First news headline')
    expect(first.link).toBe('https://t.me/tnews365/100')
    expect(first.pubDate).toBe(Date.parse('Mon, 06 Jan 2025 10:00:00 GMT'))
  })
  test('falls back to description when title is empty', () => {
    const items = parseRssItems(loadFixture(), domParser)
    const second = items.find((it) => it.id.includes('/99'))!
    expect(second.title.startsWith('Body of the second')).toBe(true)
  })
  test('strips dangerous content from description', () => {
    const items = parseRssItems(loadFixture(), domParser)
    const third = items.find((it) => it.id.includes('/98'))!
    expect(third.descriptionHtml).not.toContain('<script')
    expect(third.descriptionHtml).not.toContain('javascript:')
    expect(third.descriptionHtml).toContain('https://example.com')
    expect(third.descriptionHtml).toContain('https://cdn.example.com/img.jpg')
  })
  test('drops items without pubDate', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>nope</title><link>https://t.me/x/1</link></item>
      </channel></rss>`
    const items = parseRssItems(xml, domParser)
    expect(items).toHaveLength(0)
  })
  test('drops items without link', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>nope</title><pubDate>Mon, 06 Jan 2025 10:00:00 GMT</pubDate></item>
      </channel></rss>`
    const items = parseRssItems(xml, domParser)
    expect(items).toHaveLength(0)
  })
  test('returns empty array on malformed XML', () => {
    const items = parseRssItems('<<<not xml>>>', domParser)
    expect(items).toEqual([])
  })
  test('returns empty array on empty input', () => {
    const items = parseRssItems('', domParser)
    expect(items).toEqual([])
  })
})

describe('extractTitle', () => {
  const parser = domParser
  test('returns raw title when present', () => {
    expect(extractTitle('  Hello  ', '<p>body</p>', parser)).toBe('Hello')
  })
  test('falls back to first 60 chars of plain-text body', () => {
    const html = '<p>' + 'A'.repeat(80) + '</p>'
    const out = extractTitle('', html, parser)
    expect(out.length).toBe(60)
    expect(out.endsWith('…')).toBe(true)
  })
  test('returns short body unchanged (no ellipsis)', () => {
    const out = extractTitle('', '<p>short body</p>', parser)
    expect(out).toBe('short body')
  })
  test('returns empty when both empty', () => {
    expect(extractTitle('', '', parser)).toBe('')
  })
})

describe('sanitizeHtml', () => {
  const parser = domParser
  test('removes script and style and their content', () => {
    const out = sanitizeHtml('<p>ok</p><script>alert(1)</script><style>p{}</style>', parser)
    expect(out).toBe('<p>ok</p>')
  })
  test('removes iframe entirely', () => {
    const out = sanitizeHtml('<p>before</p><iframe src="x"></iframe><p>after</p>', parser)
    expect(out).toBe('<p>before</p><p>after</p>')
  })
  test('strips on* attributes', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">x</p>', parser)
    expect(out).toBe('<p>x</p>')
  })
  test('strips style attribute', () => {
    const out = sanitizeHtml('<p style="color:red">x</p>', parser)
    expect(out).toBe('<p>x</p>')
  })
  test('keeps img src and alt; strips width, height, style', () => {
    const out = sanitizeHtml(
      '<img src="https://x/a.jpg" width="100" height="50" style="border:0" alt="hi"/>',
      parser,
    )
    expect(out).toContain('src="https://x/a.jpg"')
    expect(out).toContain('alt="hi"')
    expect(out).not.toContain('width=')
    expect(out).not.toContain('height=')
    expect(out).not.toContain('style=')
  })
  test('removes javascript: and data: and vbscript: hrefs', () => {
    const out = sanitizeHtml(
      '<a href="javascript:alert(1)">x</a><a href="data:text/html,evil">y</a><a href="https://ok.com">z</a>',
      parser,
    )
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('data:text/html')
    expect(out).toContain('https://ok.com')
  })
  test('adds target=_blank and rel=noopener noreferrer to allowed anchor', () => {
    const out = sanitizeHtml('<a href="https://x">link</a>', parser)
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
  test('unwraps unknown tags but keeps their text', () => {
    const out = sanitizeHtml('<weird><span>kept</span></weird>', parser)
    expect(out).toContain('kept')
    expect(out).not.toContain('<weird')
  })
  test('wraps img in anchor with src as href', () => {
    const out = sanitizeHtml('<img src="https://x/a.jpg"/>', parser)
    expect(out).toBe(
      '<a href="https://x/a.jpg" target="_blank" rel="noopener noreferrer"><img src="https://x/a.jpg"></a>',
    )
  })
  test('does not wrap img that is already inside an anchor', () => {
    const out = sanitizeHtml('<a href="https://y"><img src="https://x/a.jpg"/></a>', parser)
    expect(out).toBe(
      '<a href="https://y" target="_blank" rel="noopener noreferrer"><img src="https://x/a.jpg"></a>',
    )
  })

  test('strips img width and height', () => {
    const out = sanitizeHtml('<img src="https://x/a.jpg" width="200" height="100"/>', parser)
    expect(out).not.toContain('width=')
    expect(out).not.toContain('height=')
  })
})

describe('stripHtmlToText', () => {
  const parser = domParser
  test('returns plain text', () => {
    expect(stripHtmlToText('<p>hello <b>world</b></p>', parser)).toBe('hello world')
  })
  test('collapses whitespace', () => {
    expect(stripHtmlToText('<p>a</p>  <p>b</p>\n<p>c</p>', parser)).toBe('a b c')
  })
  test('empty input → empty output', () => {
    expect(stripHtmlToText('', parser)).toBe('')
  })
})

function makeItem(over: Partial<TnewsItem>): TnewsItem {
  return {
    id: over.link ?? 'https://t.me/x/1',
    title: over.title ?? 'title',
    link: over.link ?? 'https://t.me/x/1',
    pubDate: over.pubDate ?? Date.parse('Mon, 06 Jan 2025 10:00:00 GMT'),
    descriptionHtml: over.descriptionHtml ?? '',
  }
}

describe('mergeByLink', () => {
  test('unions by link, keeping newer pubDate on conflict', () => {
    const a = [makeItem({ link: 'https://t.me/a', pubDate: 100 })]
    const b = [makeItem({ link: 'https://t.me/a', pubDate: 200 })]
    const out = mergeByLink(a, b)
    expect(out).toHaveLength(1)
    expect(out[0]!.pubDate).toBe(200)
  })
  test('combines distinct links', () => {
    const a = [makeItem({ link: 'https://t.me/a' })]
    const b = [makeItem({ link: 'https://t.me/b' })]
    const out = mergeByLink(a, b)
    expect(out.map((it) => it.link).sort()).toEqual(['https://t.me/a', 'https://t.me/b'])
  })
})

describe('filterByRetention', () => {
  test('keeps items within retention window', () => {
    const now = 1000
    const items = [
      makeItem({ link: 'https://t.me/a', pubDate: 500 }),
      makeItem({ link: 'https://t.me/b', pubDate: 100 }),
    ]
    const out = filterByRetention(items, now, 600)
    expect(out.map((it) => it.link)).toEqual(['https://t.me/a'])
  })
  test('retention boundary', () => {
    const now = Date.parse('Wed, 08 Jan 2025 10:00:00 GMT')
    const fresh = makeItem({ link: 'https://t.me/a', pubDate: now - 71 * 3600 * 1000 })
    const expired = makeItem({ link: 'https://t.me/b', pubDate: now - 73 * 3600 * 1000 })
    const out = filterByRetention([fresh, expired], now, 72 * 3600 * 1000)
    expect(out.map((it) => it.link)).toEqual(['https://t.me/a'])
  })
})

describe('sortByPubDateDesc', () => {
  test('sorts by pubDate descending', () => {
    const items = [
      makeItem({ link: 'https://t.me/a', pubDate: 100 }),
      makeItem({ link: 'https://t.me/b', pubDate: 300 }),
      makeItem({ link: 'https://t.me/c', pubDate: 200 }),
    ]
    const out = sortByPubDateDesc(items)
    expect(out.map((it) => it.link)).toEqual(['https://t.me/b', 'https://t.me/c', 'https://t.me/a'])
  })
  test('does not mutate input', () => {
    const items = [
      makeItem({ link: 'https://t.me/a', pubDate: 100 }),
      makeItem({ link: 'https://t.me/b', pubDate: 200 }),
    ]
    sortByPubDateDesc(items)
    expect(items[0]!.link).toBe('https://t.me/a')
  })
})
