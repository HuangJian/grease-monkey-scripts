import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, waitFor } from '@testing-library/preact'
import { createNovelsEditor } from '../../../src/prism/novels/editor/form'
import { BOOKS_PER_PAGE } from '../../../src/prism/novels/editor/list-toolbar'
import { DEFAULT_SOURCE_SETTINGS } from '../../../src/prism/types'
import type { NovelBookConfig } from '../../../src/prism/novels/types'
import { createRuntime, type TestRuntime } from '../../runtime'

afterEach(cleanup)

/** The scale this redesign is for: fifty books, some with several sources. */
function manyBooks(count: number): NovelBookConfig[] {
  return Array.from({ length: count }, (_u, i) => ({
    title: `第 ${i} 本书`,
    urls: [`https://www.sudugu.org/${i}/`, `https://other.example/${i}/`],
  }))
}

async function setup(runtime: TestRuntime = createRuntime(), books: NovelBookConfig[] = []) {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  const editor = createNovelsEditor(
    {
      books,
      ttlMinutes: 60,
      initialNewChapters: 5,
      maxNewChaptersPerBook: 20,
      maxLatestWindow: 10,
      getCachedTitles: () => Promise.resolve(new Map()),
    },
    DEFAULT_SOURCE_SETTINGS,
  )
  const result = await editor(root, { runtime, onRevert: () => {}, close: () => {} })
  await new Promise((r) => setTimeout(r, 0))
  return { runtime, root, result }
}

function rows(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('.gm-sp-ne-book'))
}

const tick = () => new Promise((r) => setTimeout(r, 0))

function search(root: HTMLElement, value: string): void {
  const input = root.querySelector('[data-action="toolbar-search"]') as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
}

function counter(root: HTMLElement): string {
  return root.querySelector('[data-action="toolbar-counter"]')?.textContent ?? ''
}

describe('novels editor long list', () => {
  test('paginates a fifty-book library', async () => {
    const { root } = await setup(createRuntime(), manyBooks(50))
    expect(rows(root)).toHaveLength(BOOKS_PER_PAGE)
    expect(root.querySelector('[data-action="page-label"]')?.textContent).toBe('1 / 3')

    root.querySelector<HTMLButtonElement>('[data-action="page-next"]')!.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="page-label"]')?.textContent).toBe('2 / 3')
    })
  })

  test('books start collapsed, showing a title and a source count', async () => {
    const { root } = await setup(createRuntime(), manyBooks(3))
    // Collapsed means no editable url fields at all.
    expect(root.querySelectorAll('[data-action="book-url"]')).toHaveLength(0)
    // Every book carries its own count — query one, not a text match.
    expect(root.querySelector('.gm-sp-ne-book-meta')?.textContent).toBe('2 个来源')
  })

  test('全部展开 opens every visible book, 全部折叠 closes them again', async () => {
    const { root } = await setup(createRuntime(), manyBooks(2))
    root.querySelector<HTMLButtonElement>('[data-action="expand-all"]')!.click()
    await waitFor(() => {
      expect(root.querySelectorAll('[data-action="book-url"]')).toHaveLength(4)
    })
    root.querySelector<HTMLButtonElement>('[data-action="collapse-all"]')!.click()
    await waitFor(() => {
      expect(root.querySelectorAll('[data-action="book-url"]')).toHaveLength(0)
    })
  })

  test('clicking anywhere on the row toggles it, not just the marker', async () => {
    const { root } = await setup(createRuntime(), manyBooks(1))
    root.querySelector<HTMLElement>('[data-action="book-head"]')!.click()
    await tick()
    expect(root.querySelectorAll('[data-action="book-url"]')).toHaveLength(2)
    root.querySelector<HTMLElement>('[data-action="book-head"]')!.click()
    await tick()
    expect(root.querySelectorAll('[data-action="book-url"]')).toHaveLength(0)
  })

  test('the row checkbox and 删除 keep their own meaning', async () => {
    const { root } = await setup(createRuntime(), manyBooks(2))
    const pick = root.querySelector<HTMLInputElement>('[data-action="book-pick"]')!
    pick.click()
    await tick()
    // Still collapsed, and selected — the row click must not have fired.
    expect(root.querySelectorAll('[data-action="book-url"]')).toHaveLength(0)
    expect(root.querySelector('[data-action="toolbar-selected"]')?.textContent).toBe('已选 1')

    root.querySelector<HTMLButtonElement>('.gm-sp-item-remove')!.click()
    await tick()
    expect(rows(root)).toHaveLength(1)
  })

  test('search matches the title and any source url', async () => {
    const { root } = await setup(createRuntime(), manyBooks(12))
    search(root, '第 3 本书')
    await waitFor(() => {
      expect(rows(root)).toHaveLength(1)
    })
    expect(counter(root)).toBe('共 12 · 命中 1')

    search(root, 'other.example/7/')
    await waitFor(() => {
      expect(rows(root)).toHaveLength(1)
    })
    expect(rows(root)[0]!.dataset['bookKey']).toBe('https://www.sudugu.org/7/')
  })

  test('the 未知站点 filter finds books with an unregistered source', async () => {
    const { root } = await setup(createRuntime(), [
      { title: '已知源', urls: ['https://www.sudugu.org/1/'] },
      { title: '混杂源', urls: ['https://www.sudugu.org/2/', 'https://other.example/2/'] },
    ])
    const select = root.querySelector('[data-action="toolbar-status"]') as HTMLSelectElement
    select.value = 'unknown'
    select.dispatchEvent(new Event('change'))
    await waitFor(() => {
      expect(rows(root)).toHaveLength(1)
    })
    expect(rows(root)[0]!.dataset['bookKey']).toBe('https://www.sudugu.org/2/')
  })

  test('bulk delete covers the filtered books, after a confirmation', async () => {
    const { root } = await setup(createRuntime(), manyBooks(5))
    search(root, '第 1 本书')
    await waitFor(() => {
      expect(rows(root)).toHaveLength(1)
    })
    root.querySelector<HTMLInputElement>('[data-action="toolbar-select-all"]')!.click()
    await tick()
    root.querySelector<HTMLButtonElement>('[data-action="bulk-remove"]')!.click()
    await tick()
    expect(root.querySelector('[data-action="bulk-remove-guard"]')).not.toBeNull()
    root.querySelector<HTMLButtonElement>('[data-action="bulk-remove-confirm"]')!.click()
    await tick()
    search(root, '')
    await tick()
    expect(counter(root)).toBe('共 4 本书')
  })

  test('an expanded source url is editable and applied on blur', async () => {
    const { root, result } = await setup(createRuntime(), [
      { title: '一本书', urls: ['https://www.sudugu.org/9/'] },
    ])
    root.querySelector<HTMLElement>('[data-action="book-head"]')!.click()
    await waitFor(() => {
      expect(root.querySelector('[data-action="book-url"]')).not.toBeNull()
    })
    const field = root.querySelector<HTMLInputElement>('[data-action="book-url"]')!
    field.value = 'https://www.sudugu.org/10/'
    field.dispatchEvent(new Event('input'))
    field.dispatchEvent(new Event('blur'))
    await waitFor(() => {
      expect((root.querySelector('[data-action="book-url"]') as HTMLInputElement).value).toBe(
        'https://www.sudugu.org/10/',
      )
    })
    expect(result.isDirty?.()).toBe(true)
  })

  test('declares the widest dialog and stays clean until an edit happens', async () => {
    const { root, result } = await setup(createRuntime(), manyBooks(2))
    expect(result.size).toBe('xl')
    expect(result.isDirty?.()).toBe(false)
    search(root, '第 1')
    expect(result.isDirty?.()).toBe(false)
  })
})
