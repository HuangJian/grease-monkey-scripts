import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { renderNovels } from '../../../src/dashboard/novels/render'
import type { NovelBook, NovelData } from '../../../src/dashboard/novels/types'

function dom(): JSDOM {
  return new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'https://example.com/',
  })
}

function chapter(url: string, title: string, postedAt?: number) {
  return postedAt != null ? { url, title, postedAt } : { url, title }
}

function book(
  overrides: Partial<NovelBook> & Pick<NovelBook, 'url' | 'siteId' | 'title'>,
): NovelBook {
  return {
    latestChapters: [],
    fetchedAt: 0,
    ...overrides,
  }
}

let root: HTMLElement
let document: Document
let markedSeen: string[]

beforeEach(() => {
  const d = dom()
  document = d.window.document
  root = document.getElementById('root')!
  markedSeen = []
})

afterEach(() => {
  root.replaceChildren()
})

function ctx() {
  return {
    onMarkSeen: (url: string) => {
      markedSeen.push(url)
    },
  }
}

describe('renderNovels', () => {
  test('empty data shows empty state', () => {
    renderNovels(root, null, ctx())
    expect(root.textContent).toContain('尚未添加小说')
  })

  test('empty books array shows empty state', () => {
    renderNovels(root, { books: [] }, ctx())
    expect(root.textContent).toContain('尚未添加小说')
  })

  test('book with new chapters lists them and triggers markSeen on click', () => {
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: '九龙夺嫡',
          latestChapters: [
            chapter('https://www.sudugu.org/166/c2.html', '第2章', Date.now() - 1000),
            chapter('https://www.sudugu.org/166/c1.html', '第1章', Date.now() - 1000),
          ],
        }),
      ],
    }
    renderNovels(root, data, ctx())
    const items = root.querySelectorAll('.gm-sp-novels-chapter')
    expect(items.length).toBe(2)
    const link = items[0]!.querySelector('a.gm-sp-novels-chapter-link') as HTMLAnchorElement
    expect(link.href).toBe('https://www.sudugu.org/166/c2.html')
    link.click()
    expect(markedSeen).toEqual(['https://www.sudugu.org/166/'])
  })

  test('book with no new chapters shows "无更新"', () => {
    const now = Date.now()
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: '九龙夺嫡',
          latestChapters: [
            chapter('https://www.sudugu.org/166/c2.html', '第2章', now - 1000),
            chapter('https://www.sudugu.org/166/c1.html', '第1章', now - 1000),
          ],
          lastSeenChapterUrl: 'https://www.sudugu.org/166/c2.html',
        }),
      ],
    }
    renderNovels(root, data, ctx())
    const status = root.querySelector('.gm-sp-novels-book-status')!
    expect(status.textContent).toBe('无更新')
    const readItems = root.querySelectorAll('.gm-sp-novels-chapter')
    expect(readItems.length).toBe(1)
    expect(readItems[0]!.querySelector('.gm-sp-novels-chapter-time')!.textContent).toContain(
      '【已读】',
    )
    expect(readItems[0]!.querySelector('.gm-sp-novels-chapter-title')!.textContent).not.toContain(
      '【已读】',
    )
  })

  test('book with more than 5 new chapters starts folded and expands on click', () => {
    const chapters = Array.from({ length: 8 }, (_, i) =>
      chapter(`https://www.sudugu.org/166/c${i}.html`, `第${i}章`, Date.now() - i * 1000),
    )
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: '龙藏',
          latestChapters: chapters,
        }),
      ],
    }
    renderNovels(root, data, ctx())
    const list = root.querySelector('.gm-sp-novels-chapters')!
    expect(list.classList.contains('gm-sp-novels-chapters-folded')).toBe(true)
    const toggle = root.querySelector('.gm-sp-novels-book-toggle') as HTMLButtonElement
    expect(toggle.textContent).toContain('6')
    toggle.click()
    expect(list.classList.contains('gm-sp-novels-chapters-folded')).toBe(false)
    expect(toggle.textContent).toBe('收起未读章节')
  })

  test('book with 5 new chapters does not fold', () => {
    const chapters = Array.from({ length: 5 }, (_, i) =>
      chapter(`https://www.sudugu.org/166/c${i}.html`, `第${i}章`, Date.now() - i * 1000),
    )
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: '龙藏',
          latestChapters: chapters,
        }),
      ],
    }
    renderNovels(root, data, ctx())
    expect(root.querySelector('.gm-sp-novels-book-toggle')).toBeNull()
    expect(root.querySelectorAll('.gm-sp-novels-chapter').length).toBe(5)
  })

  test('chapter without postedAt shows "刚刚更新"', () => {
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: 'T',
          latestChapters: [chapter('https://www.sudugu.org/166/c1.html', '1')],
        }),
      ],
    }
    renderNovels(root, data, ctx())
    const time = root.querySelector('.gm-sp-novels-chapter-time')!
    expect(time.textContent).toBe('刚刚更新')
  })

  test('unknown site shows warning and is not clickable as chapter', () => {
    const data: NovelData = {
      books: [
        book({
          url: 'https://other.example/x/',
          siteId: 'unknown',
          title: 'Other',
          latestChapters: [],
          error: '未知站点，暂不支持',
        }),
      ],
    }
    renderNovels(root, data, ctx())
    const block = root.querySelector('.gm-sp-novels-book-unknown')!
    expect(block).not.toBeNull()
    expect(root.querySelector('.gm-sp-novels-book-error')!.textContent).toBe('未知站点，暂不支持')
    expect(root.querySelector('.gm-sp-novels-book-status')!.textContent).toBe('未知站点')
    expect(root.querySelectorAll('.gm-sp-novels-chapter').length).toBe(0)
  })

  test('first-time failure shows error note', () => {
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: 'T',
          latestChapters: [],
          error: 'network error',
        }),
      ],
    }
    renderNovels(root, data, ctx())
    expect(root.querySelector('.gm-sp-novels-book-status')!.textContent).toBe('加载失败')
    expect(root.querySelector('.gm-sp-novels-book-error')!.textContent).toBe('network error')
  })

  test('refresh failure with prev chapters shows chapter count and error note', () => {
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: 'T',
          latestChapters: [chapter('https://www.sudugu.org/166/c1.html', '1')],
          lastSeenChapterUrl: 'https://www.sudugu.org/166/c0.html',
          error: 'timeout',
        }),
      ],
    }
    renderNovels(root, data, ctx())
    expect(root.querySelector('.gm-sp-novels-book-status')!.textContent).toBe('1 章新')
    expect(root.querySelectorAll('.gm-sp-novels-chapter').length).toBe(1)
    const err = root.querySelector('.gm-sp-novels-book-error') as HTMLElement
    expect(err.textContent).toContain('timeout')
  })

  test('read books appear after unread books', () => {
    const data: NovelData = {
      books: [
        book({
          url: 'https://example.com/a/',
          siteId: 'test',
          title: '已读完',
          latestChapters: [chapter('https://example.com/a/c2', '第2章', 1000)],
          lastSeenChapterUrl: 'https://example.com/a/c2',
        }),
        book({
          url: 'https://example.com/b/',
          siteId: 'test',
          title: '有更新',
          latestChapters: [
            chapter('https://example.com/b/c3', '第3章', 2000),
            chapter('https://example.com/b/c2', '第2章', 1000),
          ],
        }),
      ],
    }
    renderNovels(root, data, ctx())
    const blocks = root.querySelectorAll('.gm-sp-novels-book')
    expect(blocks.length).toBe(2)
    expect(blocks[0]!.querySelector('.gm-sp-novels-book-title')!.textContent).toBe('有更新')
    expect(blocks[1]!.querySelector('.gm-sp-novels-book-title')!.textContent).toBe('已读完')
  })

  test('clicking any chapter link marks the book as seen', () => {
    const data: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: 'T',
          latestChapters: [
            chapter('https://www.sudugu.org/166/c2.html', '2', 1),
            chapter('https://www.sudugu.org/166/c1.html', '1', 1),
            chapter('https://www.sudugu.org/166/c0.html', '0', 1),
          ],
          lastSeenChapterUrl: 'https://www.sudugu.org/166/c0.html',
        }),
      ],
    }
    renderNovels(root, data, ctx())
    const links = root.querySelectorAll<HTMLAnchorElement>('a.gm-sp-novels-chapter-link')
    expect(links.length).toBe(2)
    links[0]!.click()
    links[1]!.click()
    expect(markedSeen).toEqual(['https://www.sudugu.org/166/', 'https://www.sudugu.org/166/'])
  })
})
