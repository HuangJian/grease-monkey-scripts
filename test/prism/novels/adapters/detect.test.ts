import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectAdapter } from '../../../../src/prism/novels/adapters/detect'
import { suduguAdapter } from '../../../../src/prism/novels/adapters/sudugu'

const fixture = (name: string) =>
  readFileSync(join(import.meta.dir, '..', '__fixtures__', name), 'utf8')
const dom = () => new DOMParser()

describe('detectAdapter', () => {
  test('recognizes the catalog template without consulting any hostname', () => {
    expect(detectAdapter(fixture('sudugu-166.html'), dom())).toBe(suduguAdapter)
    expect(detectAdapter(fixture('sudugu-12-home.html'), dom())).toBe(suduguAdapter)
  })

  test('recognizes the deqixs page — same template, different domain', () => {
    const html = readFileSync(
      join(import.meta.dir, '..', 'fixtures', 'deqixs-97-home.html'),
      'utf8',
    )
    expect(detectAdapter(html, dom())).toBe(suduguAdapter)
  })

  test('never mistakes a site home page for a three-chapter book', () => {
    // sudugu.org/79/ now 301s to exactly this shape: .itemtxt + three links,
    // but the h1 points at a single book instead of a book directory.
    const homepage = `<!doctype html><html><body><div class="itemtxt">
      <h1><span>置顶</span><a href="/14/">某书</a></h1>
      <ul><li><a href="/14/c1.html">第1036章</a></li></ul>
    </div></body></html>`
    expect(detectAdapter(homepage, dom())).toBeUndefined()
  })

  test('accepts a catalog-less book page that has the #dir anchor', () => {
    const book = `<!doctype html><html><body><div class="itemtxt">
      <h1><a href="/1210/#dir">1984：从川菜馆开始</a></h1>
      <ul><li><i>今天</i><a href="/1210/c1.html">第1章</a></li></ul>
    </div></body></html>`
    expect(detectAdapter(book, dom())).toBe(suduguAdapter)
  })

  test('rejects empty and unrelated pages', () => {
    expect(detectAdapter('', dom())).toBeUndefined()
    expect(detectAdapter('<html><body><p>hello</p></body></html>', dom())).toBeUndefined()
  })
})
