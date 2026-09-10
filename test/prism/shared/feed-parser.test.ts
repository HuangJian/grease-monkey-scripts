import { describe, expect, test } from 'bun:test'
import {
  extractTitle,
  normalizeLink,
  parseFeed,
  parsePubDateMs,
  stripHtmlToText,
} from '../../../src/prism/shared/feed-parser'
import { XmlDOMParser } from '../../runtime'

const domParser: DOMParser = new XmlDOMParser()

const RSS_2_0 = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example Feed</title>
    <link>https://example.com/</link>
    <item>
      <title>First post</title>
      <link>https://example.com/posts/1</link>
      <guid>https://example.com/posts/1</guid>
      <pubDate>Mon, 02 Jan 2006 15:04:05 GMT</pubDate>
      <dc:creator>Jane Doe</dc:creator>
      <description><![CDATA[<p>Hello &amp; welcome</p><script>alert(1)</script>]]></description>
    </item>
    <item>
      <title>No date</title>
      <link>https://example.com/posts/2</link>
      <description>plain summary</description>
    </item>
  </channel>
</rss>`

const ATOM_1_0 = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <link rel="self" href="https://example.org/feed"/>
  <entry>
    <title>Atom entry</title>
    <link rel="alternate" type="text/html" href="https://example.org/2026/01/atom-entry"/>
    <id>urn:uuid:1225c695-cfb8-4ebb-aaaa-80da344efa6a</id>
    <updated>2026-01-02T15:04:05Z</updated>
    <published>2026-01-02T15:04:05Z</published>
    <author><name>John Smith</name><uri>https://example.org/</uri></author>
    <summary type="html">&lt;p&gt;Atom summary&lt;/p&gt;</summary>
  </entry>
</feed>`

const RDF_1_0 = `<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <channel rdf:about="https://example.net/">
    <title>RDF Feed</title>
  </channel>
  <item rdf:about="https://example.net/item/1">
    <title>RDF item</title>
    <link>https://example.net/item/1</link>
    <description>rdf summary</description>
  </item>
</rdf:RDF>`

describe('parseFeed · RSS 2.0', () => {
  test('reads feed title from channel', () => {
    expect(parseFeed(RSS_2_0, domParser).title).toBe('Example Feed')
  })

  test('maps title / link / guid / pubDate / sanitized summary', () => {
    const [first] = parseFeed(RSS_2_0, domParser).items
    expect(first!.title).toBe('First post')
    expect(first!.link).toBe('https://example.com/posts/1')
    expect(first!.id).toBe('https://example.com/posts/1')
    expect(first!.pubDate).toBe(Date.parse('Mon, 02 Jan 2006 15:04:05 GMT'))
    expect(first!.summaryHtml).toBe('<p>Hello &amp; welcome</p>')
  })

  test('strips script from CDATA description', () => {
    const [first] = parseFeed(RSS_2_0, domParser).items
    expect(first!.summaryHtml).not.toContain('script')
  })

  test('reads namespaced dc:creator as author', () => {
    const [first] = parseFeed(RSS_2_0, domParser).items
    expect(first!.author).toBe('Jane Doe')
  })

  test('keeps items without a publish date (policy belongs to the caller)', () => {
    const items = parseFeed(RSS_2_0, domParser).items
    expect(items.length).toBe(2)
    expect(items[1]!.title).toBe('No date')
    expect(items[1]!.pubDate).toBe(0)
  })
})

describe('parseFeed · Atom 1.0', () => {
  test('reads feed title', () => {
    expect(parseFeed(ATOM_1_0, domParser).title).toBe('Atom Feed')
  })

  test('prefers rel="alternate" link href over rel="self"', () => {
    const [entry] = parseFeed(ATOM_1_0, domParser).items
    expect(entry!.link).toBe('https://example.org/2026/01/atom-entry')
    expect(entry!.id).toBe('https://example.org/2026/01/atom-entry')
  })

  test('reads published date and author/name instead of concatenated author text', () => {
    const [entry] = parseFeed(ATOM_1_0, domParser).items
    expect(entry!.pubDate).toBe(Date.parse('2026-01-02T15:04:05Z'))
    expect(entry!.author).toBe('John Smith')
  })

  test('reads summary when content is absent', () => {
    const [entry] = parseFeed(ATOM_1_0, domParser).items
    expect(entry!.summaryHtml).toContain('Atom summary')
  })
})

describe('parseFeed · RDF / RSS 1.0', () => {
  test('parses <item> siblings and reads the feed title', () => {
    const { title, items } = parseFeed(RDF_1_0, domParser)
    expect(title).toBe('RDF Feed')
    expect(items.length).toBe(1)
    expect(items[0]!.link).toBe('https://example.net/item/1')
  })

  test('falls back to rdf:about when the item has no <link> child', () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
      <item rdf:about="https://example.net/item/9"><title>Only about</title></item>
    </rdf:RDF>`
    const { items } = parseFeed(xml, domParser)
    expect(items.length).toBe(1)
    expect(items[0]!.link).toBe('https://example.net/item/9')
  })
})

describe('parseFeed · robustness', () => {
  test('returns empty result for empty input', () => {
    expect(parseFeed('', domParser)).toEqual({ title: '', items: [] })
  })

  test('returns empty result for whitespace-only input', () => {
    expect(parseFeed('   \n  ', domParser)).toEqual({ title: '', items: [] })
  })

  test('returns empty result instead of throwing on malformed XML', () => {
    const { items } = parseFeed('<rss><channel><item>', domParser)
    expect(items).toEqual([])
  })

  test('drops entries without any resolvable link', () => {
    const xml = `<rss version="2.0"><channel>
      <item><title>orphan</title></item>
      <item><title>linked</title><link>https://example.com/x</link></item>
    </channel></rss>`
    const { items } = parseFeed(xml, domParser)
    expect(items.map((it) => it.title)).toEqual(['linked'])
  })

  test('identity is the canonical link, not the guid (guid churn must not reset read state)', () => {
    const xml = `<rss version="2.0"><channel>
      <item><title>t</title><link>https://example.com/a#frag</link><guid>guid-1</guid></item>
    </channel></rss>`
    const [item] = parseFeed(xml, domParser).items
    expect(item!.id).toBe('https://example.com/a')
    expect(item!.id).not.toBe('guid-1')
  })

  test('keeps the raw link when the URL is unparseable', () => {
    const xml = `<rss version="2.0"><channel>
      <item><title>t</title><link>not a url</link></item>
    </channel></rss>`
    const [item] = parseFeed(xml, domParser).items
    expect(item!.link).toBe('not a url')
    expect(item!.id).toBe('not a url')
  })
})

describe('parsePubDateMs', () => {
  test('parses RFC 822 / ISO 8601 / Atom variants', () => {
    expect(parsePubDateMs('Mon, 02 Jan 2006 15:04:05 GMT')).toBeGreaterThan(0)
    expect(parsePubDateMs('2026-01-02T15:04:05Z')).toBeGreaterThan(0)
    expect(parsePubDateMs('2026-01-02T15:04:05+08:00')).toBeGreaterThan(0)
  })

  test('returns 0 for missing or unparseable values', () => {
    expect(parsePubDateMs('')).toBe(0)
    expect(parsePubDateMs(undefined)).toBe(0)
    expect(parsePubDateMs('not a date')).toBe(0)
  })
})

describe('normalizeLink', () => {
  test('lowercases host and drops fragment', () => {
    expect(normalizeLink('https://EXample.com/A/1#frag')).toBe('https://example.com/A/1')
  })
  test('removes trailing slash from non-root path only', () => {
    expect(normalizeLink('https://example.com/a/')).toBe('https://example.com/a')
    expect(normalizeLink('https://example.com/')).toBe('https://example.com/')
  })
  test('returns input when unparseable', () => {
    expect(normalizeLink('not a url')).toBe('not a url')
  })
})

describe('extractTitle', () => {
  test('prefers the raw title', () => {
    expect(extractTitle('  Hello  ', '<p>body</p>', domParser)).toBe('Hello')
  })

  test('falls back to truncated body text when the title is empty', () => {
    const out = extractTitle('', '<p>' + 'A'.repeat(80) + '</p>', domParser)
    expect(out.length).toBe(60)
    expect(out.endsWith('…')).toBe(true)
  })

  test('honours a custom maxChars', () => {
    const out = extractTitle('', '<p>' + 'B'.repeat(80) + '</p>', domParser, 20)
    expect(out.length).toBe(20)
    expect(out.endsWith('…')).toBe(true)
  })

  test('returns empty when nothing is available', () => {
    expect(extractTitle('', '', domParser)).toBe('')
  })
})

describe('stripHtmlToText', () => {
  test('flattens markup and collapses whitespace', () => {
    expect(stripHtmlToText('<p>one</p>\n  <p>two</p>', domParser)).toBe('one two')
  })
  test('returns empty for empty input', () => {
    expect(stripHtmlToText('', domParser)).toBe('')
  })
})
