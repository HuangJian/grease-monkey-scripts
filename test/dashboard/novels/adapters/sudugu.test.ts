import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseChapterLabel, suduguAdapter } from '../../../../src/dashboard/novels/adapters/sudugu'

function loadFixture(name: string): string {
  return readFileSync(join(import.meta.dir, '..', '__fixtures__', name), 'utf8')
}

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://www.sudugu.org/',
  })
}

const NOW_2026_06_03 = new Date(2026, 5, 3, 12, 0, 0).getTime()

describe('parseChapterLabel', () => {
  test('returns undefined for empty / unknown', () => {
    expect(parseChapterLabel('')).toBeUndefined()
    expect(parseChapterLabel('   ')).toBeUndefined()
    expect(parseChapterLabel('未知格式', NOW_2026_06_03)).toBeUndefined()
  })
  test('parses 今天 to start of today', () => {
    const t = parseChapterLabel('今天', NOW_2026_06_03)!
    const d = new Date(t)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(3)
    expect(d.getHours()).toBe(0)
  })
  test('parses 昨天 to start of yesterday', () => {
    const t = parseChapterLabel('昨天', NOW_2026_06_03)!
    const d = new Date(t)
    expect(d.getDate()).toBe(2)
    expect(d.getHours()).toBe(0)
  })
  test('parses MM-DD as current year', () => {
    const t = parseChapterLabel('05-31', NOW_2026_06_03)!
    const d = new Date(t)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(31)
  })
  test('rolls MM-DD back a year when it would be in the future', () => {
    const t = parseChapterLabel('12-25', NOW_2026_06_03)!
    const d = new Date(t)
    expect(d.getFullYear()).toBe(2025)
    expect(d.getMonth()).toBe(11)
    expect(d.getDate()).toBe(25)
  })
  test('parses HH:MM as today at that time', () => {
    const t = parseChapterLabel('18:30', NOW_2026_06_03)!
    const d = new Date(t)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5)
    expect(d.getDate()).toBe(3)
    expect(d.getHours()).toBe(18)
    expect(d.getMinutes()).toBe(30)
  })
  test('parses YYYY-MM-DD', () => {
    const t = parseChapterLabel('2024-01-15', NOW_2026_06_03)!
    const d = new Date(t)
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(15)
  })
})

describe('suduguAdapter.parseHome', () => {
  test('extracts book title without 字数 prefix', () => {
    const dom = makeDom()
    const html = loadFixture('sudugu-166.html')
    const { title } = suduguAdapter.parseHome(
      html,
      'https://www.sudugu.org/166/',
      new dom.window.DOMParser(),
      NOW_2026_06_03,
    )
    expect(title).toBe('九龙夺嫡，我真不想当太子')
  })
  test('extracts latest three chapters with absolute urls and labels', () => {
    const dom = makeDom()
    const html = loadFixture('sudugu-166.html')
    const { latestThree } = suduguAdapter.parseHome(
      html,
      'https://www.sudugu.org/166/',
      new dom.window.DOMParser(),
      NOW_2026_06_03,
    )
    expect(latestThree).toHaveLength(3)
    expect(latestThree[0]!.url).toBe('https://www.sudugu.org/166/3874094.html')
    expect(latestThree[0]!.title).toBe('第798章 请为太子加九锡')
    expect(latestThree[0]!.postedAt).toBeDefined()
    expect(latestThree[2]!.url).toBe('https://www.sudugu.org/166/3871335.html')
    expect(latestThree[2]!.title).toBe('第796章 父皇，你别无选择')
  })
  test('detects lastPageNumber = 1 when no pagination exists', () => {
    const dom = makeDom()
    const html = loadFixture('sudugu-166.html')
    const { lastPageNumber } = suduguAdapter.parseHome(
      html,
      'https://www.sudugu.org/166/',
      new dom.window.DOMParser(),
      NOW_2026_06_03,
    )
    expect(lastPageNumber).toBe(1)
  })
  test('detects lastPageNumber > 1 when pagination exists', () => {
    const dom = makeDom()
    const html = loadFixture('sudugu-12-home.html')
    const { lastPageNumber } = suduguAdapter.parseHome(
      html,
      'https://www.sudugu.org/12/',
      new dom.window.DOMParser(),
      NOW_2026_06_03,
    )
    expect(lastPageNumber).toBe(2)
  })
  test('extracts title and latest three for paginated book', () => {
    const dom = makeDom()
    const html = loadFixture('sudugu-12-home.html')
    const { title, latestThree } = suduguAdapter.parseHome(
      html,
      'https://www.sudugu.org/12/',
      new dom.window.DOMParser(),
      NOW_2026_06_03,
    )
    expect(title).toBe('龙藏')
    expect(latestThree).toHaveLength(3)
    expect(latestThree[0]!.url).toBe('https://www.sudugu.org/12/3873955.html')
    expect(latestThree[0]!.title).toBe('第1302章 敌人和朋友')
  })
  test('returns empty result for empty html', () => {
    const dom = makeDom()
    const result = suduguAdapter.parseHome(
      '',
      'https://www.sudugu.org/166/',
      new dom.window.DOMParser(),
      NOW_2026_06_03,
    )
    expect(result.title).toBeNull()
    expect(result.latestThree).toEqual([])
    expect(result.lastPageNumber).toBe(1)
  })
})

describe('suduguAdapter.parseChapterList', () => {
  test('extracts all chapter URLs and titles from tail page', () => {
    const dom = makeDom()
    const html = loadFixture('sudugu-12-tail.html')
    const chapters = suduguAdapter.parseChapterList(
      html,
      'https://www.sudugu.org/12/p-2.html',
      new dom.window.DOMParser(),
    )
    expect(chapters.length).toBeGreaterThan(100)
    const last = chapters[chapters.length - 1]!
    expect(last.url).toBe('https://www.sudugu.org/12/3873955.html')
    expect(last.title).toBe('第1302章 敌人和朋友')
    for (const c of chapters) {
      expect(c.postedAt).toBeUndefined()
    }
  })
  test('returns empty for empty html', () => {
    const dom = makeDom()
    expect(
      suduguAdapter.parseChapterList(
        '',
        'https://www.sudugu.org/12/p-2.html',
        new dom.window.DOMParser(),
      ),
    ).toEqual([])
  })
})

describe('suduguAdapter.buildTailUrl', () => {
  test('returns home url when page is 1', () => {
    const u = 'https://www.sudugu.org/12/'
    expect(suduguAdapter.buildTailUrl(u, 1)).toBe(u)
  })
  test('builds p-N.html relative to home url', () => {
    expect(suduguAdapter.buildTailUrl('https://www.sudugu.org/12/', 2)).toBe(
      'https://www.sudugu.org/12/p-2.html',
    )
    expect(suduguAdapter.buildTailUrl('https://www.sudugu.org/166/', 5)).toBe(
      'https://www.sudugu.org/166/p-5.html',
    )
  })
})
