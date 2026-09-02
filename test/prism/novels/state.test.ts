import { describe, expect, test } from 'bun:test'
import { sourceLabel, sourceUrl, variantUrl } from '../../../src/prism/novels/mirror'
import {
  initialSeenKey,
  isNewChapter,
  newChapterCount,
  newChapters,
} from '../../../src/prism/novels/state'
import type { NovelBook, NovelChapter, NovelChapterVariant } from '../../../src/prism/novels/types'

function variant(url: string, title = url, postedAt = 0): NovelChapterVariant {
  return { url, title, postedAt, siteId: 'sudugu' }
}

function chapter(key: string, url = `https://x/${key}.html`): NovelChapter {
  return { key, title: key, postedAt: 0, variants: [variant(url, key)] }
}

function gap(count: number): NovelChapter {
  return { key: '', title: '', postedAt: 0, variants: [], omittedCount: count }
}

function book(over: Partial<NovelBook>): NovelBook {
  return {
    id: 'u:https://x/',
    title: 'T',
    sources: [],
    latestChapters: [],
    fetchedAt: 0,
    lastSeenChapterKey: '',
    error: '',
    ...over,
  }
}

describe('initialSeenKey', () => {
  test('returns empty string for empty list', () => {
    expect(initialSeenKey([], 3)).toBe('')
  })
  test('returns empty string when fewer chapters than threshold', () => {
    expect(initialSeenKey([chapter('a'), chapter('b')], 3)).toBe('')
  })
  test('returns empty string when exactly equal to threshold', () => {
    expect(initialSeenKey([chapter('a'), chapter('b'), chapter('c')], 3)).toBe('')
  })
  test('returns the chapter at index N when more than threshold', () => {
    const chapters = [chapter('a'), chapter('b'), chapter('c'), chapter('d'), chapter('e')]
    expect(initialSeenKey(chapters, 3)).toBe('d')
  })
  test('honors custom threshold', () => {
    const chapters = [chapter('a'), chapter('b'), chapter('c')]
    expect(initialSeenKey(chapters, 1)).toBe('b')
  })
  test('skips gap markers when counting', () => {
    const chapters = [chapter('a'), gap(9), chapter('b'), chapter('c'), chapter('d')]
    expect(initialSeenKey(chapters, 2)).toBe('c')
  })
})

describe('isNewChapter', () => {
  test('all NEW when nothing has been read', () => {
    const b = book({ latestChapters: [chapter('a'), chapter('b')] })
    expect(isNewChapter(chapter('a'), b)).toBe(true)
    expect(isNewChapter(chapter('b'), b)).toBe(true)
  })
  test('chapter equal to lastSeen is not NEW', () => {
    const b = book({ latestChapters: [chapter('a'), chapter('b')], lastSeenChapterKey: 'b' })
    expect(isNewChapter(chapter('b'), b)).toBe(false)
  })
  test('chapter newer than lastSeen is NEW', () => {
    const b = book({
      latestChapters: [chapter('newest'), chapter('mid'), chapter('seen')],
      lastSeenChapterKey: 'seen',
    })
    expect(isNewChapter(chapter('newest'), b)).toBe(true)
    expect(isNewChapter(chapter('mid'), b)).toBe(true)
    expect(isNewChapter(chapter('seen'), b)).toBe(false)
  })
  test('all NEW when lastSeen is no longer in list', () => {
    const b = book({ latestChapters: [chapter('a'), chapter('b')], lastSeenChapterKey: 'gone' })
    expect(isNewChapter(chapter('a'), b)).toBe(true)
    expect(isNewChapter(chapter('b'), b)).toBe(true)
  })
  test('chapter not in list is not NEW', () => {
    const b = book({ latestChapters: [chapter('a'), chapter('b')], lastSeenChapterKey: 'b' })
    expect(isNewChapter(chapter('phantom'), b)).toBe(false)
  })
})

describe('newChapters', () => {
  test('returns only chapters newer than lastSeen', () => {
    const b = book({
      latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')],
      lastSeenChapterKey: 'c2',
    })
    expect(newChapters(b).map((c) => c.key)).toEqual(['c3'])
  })
  test('returns all chapters when nothing has been read', () => {
    const b = book({ latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')] })
    expect(newChapters(b).map((c) => c.key)).toEqual(['c3', 'c2', 'c1'])
  })
  test('returns all chapters when lastSeen is gone', () => {
    const b = book({
      latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')],
      lastSeenChapterKey: 'older',
    })
    expect(newChapters(b).map((c) => c.key)).toEqual(['c3', 'c2', 'c1'])
  })
  test('returns empty when caught up to latest', () => {
    const b = book({
      latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')],
      lastSeenChapterKey: 'c3',
    })
    expect(newChapters(b)).toEqual([])
  })
})

describe('newChapters with gap markers', () => {
  test('gap marker before seen is included in newChapters', () => {
    const b = book({
      latestChapters: [chapter('c5'), gap(16), chapter('c26'), chapter('seen')],
      lastSeenChapterKey: 'seen',
    })
    expect(newChapters(b).map((c) => c.key)).toEqual(['c5', '', 'c26'])
  })

  test('gap marker not new when seen is before it (markSeen to newest)', () => {
    const b = book({
      latestChapters: [chapter('c5'), gap(16), chapter('c26'), chapter('seen')],
      lastSeenChapterKey: 'c5',
    })
    expect(newChapters(b)).toEqual([])
    expect(newChapterCount(b)).toBe(0)
  })

  test('newChapterCount includes omittedCount from gap markers', () => {
    const b = book({
      latestChapters: [chapter('c5'), gap(16), chapter('c26'), chapter('seen')],
      lastSeenChapterKey: 'seen',
    })
    expect(newChapterCount(b)).toBe(18)
  })

  test('newChapterCount is 0 after markSeen to newest', () => {
    const b = book({
      latestChapters: [chapter('c5'), gap(979), chapter('old')],
      lastSeenChapterKey: 'c5',
    })
    expect(newChapterCount(b)).toBe(0)
    expect(newChapters(b)).toEqual([])
  })
})

describe('mirror helpers', () => {
  test('variantUrl rewrites to the host that served the chapter', () => {
    const v: NovelChapterVariant = {
      ...variant('https://www.sudugu.org/166/3.html', '第3章'),
      host: 'www.shudugu.org',
    }
    expect(variantUrl(v)).toBe('https://www.shudugu.org/166/3.html')
  })

  test('variantUrl keeps the original url when no mirror served it', () => {
    expect(variantUrl(variant('https://www.sudugu.org/166/3.html'))).toBe(
      'https://www.sudugu.org/166/3.html',
    )
  })

  test('sourceUrl rewrites to the mirror recorded for the source', () => {
    const source = {
      url: 'https://www.sudugu.org/166/',
      siteId: 'sudugu',
      mirrorHost: 'www.shudugu.org',
      chapterCount: 3,
      error: '',
    }
    expect(sourceUrl(source)).toBe('https://www.shudugu.org/166/')
  })

  test('sourceLabel shortens a hostname', () => {
    expect(sourceLabel('https://www.sudugu.org/166/')).toBe('sudugu')
    expect(sourceLabel('https://b.example/166/')).toBe('b')
    expect(sourceLabel('https://shudugu.org/166/')).toBe('shudugu')
  })

  test('sourceLabel falls back to the raw value for invalid urls', () => {
    expect(sourceLabel('not a url')).toBe('not a url')
  })
})
