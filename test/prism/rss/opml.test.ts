import { describe, expect, test } from 'bun:test'
import { buildOpml, mergeImportedFeeds, parseOpml } from '../../../src/prism/rss/opml'
import type { RssFeedConfig } from '../../../src/prism/rss/types'
import { XmlDOMParser } from '../../runtime'

const domParser: DOMParser = new XmlDOMParser()

const FEEDS: RssFeedConfig[] = [
  { url: 'https://example.com/a.xml', title: 'A 站' },
  { url: 'https://example.com/b.xml', title: '' },
]

describe('buildOpml', () => {
  test('emits one outline per feed with type/text/title/xmlUrl', () => {
    const xml = buildOpml(FEEDS)
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<opml version="2.0">')
    expect(xml).toContain('xmlUrl="https://example.com/a.xml"')
    expect(xml).toContain('text="A 站"')
    // No custom title: fall back to the URL so `text` is never empty.
    expect(xml).toContain('text="https://example.com/b.xml"')
  })

  test('escapes titles and urls', () => {
    const xml = buildOpml([{ url: 'https://example.com/?a=1&b=2', title: 'Tom & "Jerry"' }])
    expect(xml).toContain('text="Tom &amp; &quot;Jerry&quot;"')
    expect(xml).toContain('xmlUrl="https://example.com/?a=1&amp;b=2"')
  })
})

describe('parseOpml', () => {
  test('round-trips what buildOpml produces', () => {
    expect(parseOpml(buildOpml(FEEDS), domParser)).toEqual(FEEDS)
  })

  test('flattens nested category folders', () => {
    const xml = `<opml version="2.0"><body>
      <outline text="News">
        <outline type="rss" text="Nested" xmlUrl="https://example.com/nested.xml"/>
      </outline>
      <outline type="rss" text="Top" xmlUrl="https://example.com/top.xml"/>
    </body></opml>`
    expect(parseOpml(xml, domParser)).toEqual([
      { url: 'https://example.com/nested.xml', title: 'Nested' },
      { url: 'https://example.com/top.xml', title: 'Top' },
    ])
  })

  test('ignores outlines without xmlUrl', () => {
    const xml = `<opml version="2.0"><body><outline text="folder"/></body></opml>`
    expect(parseOpml(xml, domParser)).toEqual([])
  })

  test('accepts the lowercase xmlurl spelling', () => {
    const xml = `<opml version="2.0"><body>
      <outline text="x" xmlurl="https://example.com/lower.xml"/>
    </body></opml>`
    expect(parseOpml(xml, domParser)).toEqual([
      { url: 'https://example.com/lower.xml', title: 'x' },
    ])
  })

  test('treats a text that equals the url as "no custom title"', () => {
    const xml = `<opml version="2.0"><body>
      <outline text="https://example.com/u.xml" xmlUrl="https://example.com/u.xml"/>
    </body></opml>`
    expect(parseOpml(xml, domParser)).toEqual([{ url: 'https://example.com/u.xml', title: '' }])
  })

  test('falls back to the title attribute when text is absent', () => {
    const xml = `<opml version="2.0"><body>
      <outline title="ByTitle" xmlUrl="https://example.com/t.xml"/>
    </body></opml>`
    expect(parseOpml(xml, domParser)[0]!.title).toBe('ByTitle')
  })

  test('drops unparseable urls instead of failing the config later', () => {
    const xml = `<opml version="2.0"><body>
      <outline text="bad" xmlUrl="not a url"/>
      <outline text="ok" xmlUrl="https://example.com/ok.xml"/>
    </body></opml>`
    expect(parseOpml(xml, domParser)).toEqual([{ url: 'https://example.com/ok.xml', title: 'ok' }])
  })

  test('drops urls that are not http(s)', () => {
    const xml = `<opml version="2.0"><body>
      <outline text="js" xmlUrl="javascript:alert(1)"/>
      <outline text="mail" xmlUrl="mailto:a@example.com"/>
      <outline text="ok" xmlUrl="https://example.com/ok.xml"/>
    </body></opml>`
    expect(parseOpml(xml, domParser)).toEqual([{ url: 'https://example.com/ok.xml', title: 'ok' }])
  })

  test('drops duplicate urls inside one file', () => {
    const xml = `<opml version="2.0"><body>
      <outline text="one" xmlUrl="https://example.com/dup.xml"/>
      <outline text="two" xmlUrl="https://example.com/dup.xml"/>
    </body></opml>`
    expect(parseOpml(xml, domParser)).toEqual([
      { url: 'https://example.com/dup.xml', title: 'one' },
    ])
  })

  test('strips a UTF-8 BOM', () => {
    const xml = '﻿' + buildOpml(FEEDS.slice(0, 1))
    expect(parseOpml(xml, domParser)).toEqual([FEEDS[0]!])
  })

  test('returns empty for empty or malformed input', () => {
    expect(parseOpml('', domParser)).toEqual([])
    expect(parseOpml('<opml><body>', domParser)).toEqual([])
  })
})

describe('mergeImportedFeeds', () => {
  test('appends new feeds and counts them', () => {
    const outcome = mergeImportedFeeds([FEEDS[0]!], [FEEDS[1]!])
    expect(outcome.feeds).toHaveLength(2)
    expect(outcome.feeds).toEqual(FEEDS)
    expect(outcome.added).toBe(1)
    expect(outcome.skipped).toBe(0)
  })

  test('skips urls already subscribed and keeps the existing title', () => {
    const existing: RssFeedConfig[] = [{ url: 'https://example.com/a.xml', title: '自定义' }]
    const outcome = mergeImportedFeeds(existing, [
      { url: 'https://example.com/a.xml', title: 'A 站' },
    ])
    expect(outcome.feeds).toEqual(existing)
    expect(outcome.added).toBe(0)
    expect(outcome.skipped).toBe(1)
  })

  test('skips duplicates within the imported batch', () => {
    const outcome = mergeImportedFeeds(
      [],
      [
        { url: 'https://example.com/x.xml', title: '' },
        { url: 'https://example.com/x.xml', title: '' },
      ],
    )
    expect(outcome.added).toBe(1)
    expect(outcome.skipped).toBe(1)
  })

  test('does not mutate the input list', () => {
    const current: RssFeedConfig[] = []
    mergeImportedFeeds(current, FEEDS)
    expect(current).toEqual([])
  })
})
