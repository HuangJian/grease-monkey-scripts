import { describe, expect, test } from 'bun:test'
import { bookId, normalizeBook, normalizeBooks } from '../../../src/prism/novels/migrate'

const LEGACY_URL = 'https://www.sudugu.org/166/'

function legacyBook() {
  return {
    url: LEGACY_URL,
    siteId: 'sudugu',
    title: '九龙夺嫡',
    latestChapters: [
      { url: `${LEGACY_URL}3.html`, title: '第3章 风起', postedAt: 300 },
      { url: `${LEGACY_URL}2.html`, title: '第2章 雨落', postedAt: 200 },
      { url: `${LEGACY_URL}1.html`, title: '第1章 初见', postedAt: 100 },
    ],
    lastSeenChapterUrl: `${LEGACY_URL}2.html`,
    fetchedAt: 999,
    error: '',
    mirrorHost: 'shudugu.org',
  }
}

describe('normalizeBook', () => {
  test('upgrades a legacy single-source book', () => {
    const book = normalizeBook(legacyBook())!
    expect(book.id).toBe(bookId(LEGACY_URL))
    expect(book.title).toBe('九龙夺嫡')
    expect(book.fetchedAt).toBe(999)
    expect(book.sources).toEqual([
      {
        url: LEGACY_URL,
        siteId: 'sudugu',
        mirrorHost: 'shudugu.org',
        chapterCount: 0,
        error: '',
      },
    ])
  })

  test('lifts legacy chapters into single-variant entries keyed by chapter number', () => {
    const book = normalizeBook(legacyBook())!
    expect(book.latestChapters.map((c) => c.key)).toEqual(['n:3', 'n:2', 'n:1'])
    expect(book.latestChapters[0]!.title).toBe('第3章 风起')
    expect(book.latestChapters[0]!.postedAt).toBe(300)
    expect(book.latestChapters[0]!.variants).toEqual([
      {
        url: `${LEGACY_URL}3.html`,
        title: '第3章 风起',
        postedAt: 300,
        siteId: 'sudugu',
        host: 'shudugu.org',
      },
    ])
  })

  test('recovers the seen key from the legacy seen url', () => {
    const book = normalizeBook(legacyBook())!
    expect(book.lastSeenChapterKey).toBe('n:2')
  })

  test('leaves an empty seen key when the legacy url is gone', () => {
    const book = normalizeBook({ ...legacyBook(), lastSeenChapterUrl: '/missing.html' })!
    expect(book.lastSeenChapterKey).toBe('')
  })

  test('preserves an already-migrated book', () => {
    const book = normalizeBook(legacyBook())!
    expect(normalizeBook(book)).toEqual(book)
  })

  test('keeps gap markers', () => {
    const book = normalizeBook({
      ...legacyBook(),
      latestChapters: [
        { url: `${LEGACY_URL}9.html`, title: '第9章', postedAt: 900 },
        { url: '', title: '', postedAt: 0, omittedCount: 5 },
        { url: `${LEGACY_URL}3.html`, title: '第3章', postedAt: 300 },
      ],
    })!
    expect(book.latestChapters[1]).toEqual({
      key: '',
      title: '',
      postedAt: 0,
      variants: [],
      omittedCount: 5,
    })
  })

  test('drops books without any usable url', () => {
    expect(normalizeBook({ title: '孤儿' })).toBeUndefined()
    expect(normalizeBook(null)).toBeUndefined()
    expect(normalizeBook('book')).toBeUndefined()
  })
})

describe('normalizeBooks', () => {
  test('filters unparseable entries', () => {
    const books = normalizeBooks([legacyBook(), null, { title: '孤儿' }])
    expect(books).toHaveLength(1)
    expect(books[0]!.title).toBe('九龙夺嫡')
  })

  test('non-arrays yield nothing', () => {
    expect(normalizeBooks(undefined)).toEqual([])
  })
})
