import { describe, expect, test } from 'bun:test'
import { initialSeenUrl, isNewChapter, newChapters } from '../../../src/dashboard/novels/state'
import type { NovelBook, NovelChapter } from '../../../src/dashboard/novels/types'

function chapter(url: string, title = url): NovelChapter {
  return { url, title, postedAt: 0 }
}

function book(over: Partial<NovelBook>): NovelBook {
  return {
    url: 'https://x/',
    siteId: 'sudugu',
    title: 'T',
    latestChapters: [],
    fetchedAt: 0,
    lastSeenChapterUrl: '',
    error: '',
    ...over,
  }
}

describe('initialSeenUrl', () => {
  test('returns empty string for empty list', () => {
    expect(initialSeenUrl([], 3)).toBe('')
  })
  test('returns empty string when fewer chapters than threshold', () => {
    expect(initialSeenUrl([chapter('a'), chapter('b')], 3)).toBe('')
  })
  test('returns empty string when exactly equal to threshold', () => {
    expect(initialSeenUrl([chapter('a'), chapter('b'), chapter('c')], 3)).toBe('')
  })
  test('returns the chapter at index N when more than threshold', () => {
    const chapters = [chapter('a'), chapter('b'), chapter('c'), chapter('d'), chapter('e')]
    expect(initialSeenUrl(chapters, 3)).toBe('d')
  })
  test('honors custom threshold', () => {
    const chapters = [chapter('a'), chapter('b'), chapter('c')]
    expect(initialSeenUrl(chapters, 1)).toBe('b')
  })
})

describe('isNewChapter', () => {
  test('all NEW when lastSeen is empty', () => {
    const b = book({ latestChapters: [chapter('a'), chapter('b')] })
    expect(isNewChapter(chapter('a'), b)).toBe(true)
    expect(isNewChapter(chapter('b'), b)).toBe(true)
  })
  test('chapter equal to lastSeen is not NEW', () => {
    const b = book({
      latestChapters: [chapter('a'), chapter('b')],
      lastSeenChapterUrl: 'b',
    })
    expect(isNewChapter(chapter('b'), b)).toBe(false)
  })
  test('chapter newer than lastSeen is NEW', () => {
    const b = book({
      latestChapters: [chapter('newest'), chapter('mid'), chapter('seen')],
      lastSeenChapterUrl: 'seen',
    })
    expect(isNewChapter(chapter('newest'), b)).toBe(true)
    expect(isNewChapter(chapter('mid'), b)).toBe(true)
    expect(isNewChapter(chapter('seen'), b)).toBe(false)
  })
  test('all NEW when lastSeen url is no longer in list', () => {
    const b = book({
      latestChapters: [chapter('a'), chapter('b')],
      lastSeenChapterUrl: 'gone',
    })
    expect(isNewChapter(chapter('a'), b)).toBe(true)
    expect(isNewChapter(chapter('b'), b)).toBe(true)
  })
  test('chapter not in list is not NEW', () => {
    const b = book({
      latestChapters: [chapter('a'), chapter('b')],
      lastSeenChapterUrl: 'b',
    })
    expect(isNewChapter(chapter('phantom'), b)).toBe(false)
  })
})

describe('newChapters', () => {
  test('returns only chapters newer than lastSeen', () => {
    const b = book({
      latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')],
      lastSeenChapterUrl: 'c2',
    })
    expect(newChapters(b).map((c) => c.url)).toEqual(['c3'])
  })
  test('returns all chapters when lastSeen is empty', () => {
    const b = book({ latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')] })
    expect(newChapters(b).map((c) => c.url)).toEqual(['c3', 'c2', 'c1'])
  })
  test('returns all chapters when lastSeen is gone', () => {
    const b = book({
      latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')],
      lastSeenChapterUrl: 'older',
    })
    expect(newChapters(b).map((c) => c.url)).toEqual(['c3', 'c2', 'c1'])
  })
  test('returns empty when caught up to latest', () => {
    const b = book({
      latestChapters: [chapter('c3'), chapter('c2'), chapter('c1')],
      lastSeenChapterUrl: 'c3',
    })
    expect(newChapters(b)).toEqual([])
  })
})
