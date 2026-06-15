import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, within } from '@testing-library/preact'
import { renderNovels } from '../../../src/dashboard/novels/render'
import type { NovelBook, NovelData } from '../../../src/dashboard/novels/types'
// oxlint-disable-next-line no-unassigned-import
import '../../runtime'

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
let markedSeen: string[]

beforeEach(() => {
  globalThis.location.href = 'https://example.com/'
  root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  markedSeen = []
})

afterEach(() => {
  cleanup()
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
    expect(within(root).getByText(/尚未添加小说/)).not.toBeNull()
  })

  test('empty books array shows empty state', () => {
    renderNovels(root, { books: [] }, ctx())
    expect(within(root).getByText(/尚未添加小说/)).not.toBeNull()
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
    const items = within(root).getAllByRole('listitem')
    expect(items.length).toBe(2)
    const link = within(items[0]!).getByRole('link') as HTMLAnchorElement
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
    expect(within(root).getByText('无更新')).not.toBeNull()
    const readItems = within(root).getAllByRole('listitem')
    expect(readItems.length).toBe(1)
    expect(within(readItems[0]!).getByText(/已读/)).not.toBeNull()
    const titleEl = within(readItems[0]!).getByText('第2章') as HTMLElement
    expect(titleEl.textContent).not.toContain('【已读】')
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
    const list = within(root).getByRole('list')
    expect(list.classList.contains('gm-sp-novels-chapters-folded')).toBe(true)
    const toggle = within(root).getByRole('button', { name: /章未读/ }) as HTMLButtonElement
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
    expect(within(root).queryByRole('button', { name: /章未读/ })).toBeNull()
    expect(within(root).getAllByRole('listitem').length).toBe(5)
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
    expect(within(root).getByText('刚刚更新')).not.toBeNull()
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
    expect(within(root).getByText('未知站点')).not.toBeNull()
    expect(within(root).getByText('未知站点，暂不支持')).not.toBeNull()
    expect(within(root).queryAllByRole('listitem').length).toBe(0)
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
    expect(within(root).getByText('加载失败')).not.toBeNull()
    expect(within(root).getByText('network error')).not.toBeNull()
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
    expect(within(root).getByText('1 章新')).not.toBeNull()
    expect(within(root).getAllByRole('listitem').length).toBe(1)
    expect(within(root).getByText(/timeout/)).not.toBeNull()
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
    const titles = within(root).getAllByRole('link', { name: /(?:有更新|已读完)/ })
    expect(titles.length).toBe(2)
    expect(titles[0]!.textContent).toBe('有更新')
    expect(titles[1]!.textContent).toBe('已读完')
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
    const items = within(root).getAllByRole('listitem')
    expect(items.length).toBe(2)
    within(items[0]!).getByRole('link').click()
    within(items[1]!).getByRole('link').click()
    expect(markedSeen).toEqual(['https://www.sudugu.org/166/', 'https://www.sudugu.org/166/'])
  })

  test('bugfix: folded state resets when unread count drops below threshold across re-render', () => {
    const chapters6 = Array.from({ length: 6 }, (_, i) =>
      chapter(`https://www.sudugu.org/166/c${i}.html`, `第${i}章`, Date.now() - i * 1000),
    )
    const data6: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: '龙藏',
          latestChapters: chapters6,
        }),
      ],
    }
    renderNovels(root, data6, ctx())
    const list = within(root).getByRole('list')
    expect(list.classList.contains('gm-sp-novels-chapters-folded')).toBe(true)
    expect(within(root).getAllByRole('listitem').length).toBe(2)

    const chapters3 = Array.from({ length: 3 }, (_, i) =>
      chapter(`https://www.sudugu.org/166/c${i}.html`, `第${i}章`, Date.now() - i * 1000),
    )
    const data3: NovelData = {
      books: [
        book({
          url: 'https://www.sudugu.org/166/',
          siteId: 'sudugu',
          title: '龙藏',
          latestChapters: chapters3,
        }),
      ],
    }
    renderNovels(root, data3, ctx())
    const list2 = within(root).getByRole('list')
    expect(list2.classList.contains('gm-sp-novels-chapters-folded')).toBe(false)
    expect(within(root).getAllByRole('listitem').length).toBe(3)
  })
})
