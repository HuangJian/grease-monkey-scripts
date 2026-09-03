import { describe, expect, test } from 'bun:test'
import {
  collapseChapters,
  mergeSourceChapters,
  windowLatestChapters,
} from '../../../src/prism/novels/merge'
import type { NovelChapter, NovelChapterVariant } from '../../../src/prism/novels/types'

function src(siteId: string, titles: string[], postedAts: number[] = []): NovelChapterVariant[] {
  return titles.map((title, i) => ({
    url: `https://${siteId}.example/${i}.html`,
    title,
    postedAt: postedAts[i] ?? 0,
    siteId,
  }))
}

/** `第<to>章` down to `第<from>章`, newest-first. */
function numbered(from: number, to: number): string[] {
  const titles: string[] = []
  for (let n = to; n >= from; n--) titles.push(`第${n}章`)
  return titles
}

/** Merge with collapsing disabled, for asserting on the raw merged stream. */
function mergedRaw(
  sources: NovelChapterVariant[][],
  seenKey = '',
): ReturnType<typeof mergeSourceChapters> {
  return mergeSourceChapters(sources, seenKey, {
    collapseThreshold: Number.POSITIVE_INFINITY,
  })
}

describe('mergeSourceChapters', () => {
  test('no sources yields nothing', () => {
    expect(mergeSourceChapters([], '')).toEqual([])
    expect(mergeSourceChapters([[], []], '')).toEqual([])
  })

  test('a single source keeps its order and gains one variant per chapter', () => {
    const merged = mergeSourceChapters([src('a', ['第3章', '第2章', '第1章'])], '')
    expect(merged.map((c) => c.key)).toEqual(['n:3', 'n:2', 'n:1'])
    expect(merged[0]!.variants).toHaveLength(1)
    expect(merged[0]!.title).toBe('第3章')
  })

  test('the source listing the most chapters drives the order', () => {
    const behind = src('a', numbered(1, 118))
    const ahead = src('b', numbered(1, 120))
    const merged = mergedRaw([behind, ahead])

    expect(merged).toHaveLength(120)
    expect(merged[0]!.key).toBe('n:120')
    expect(merged[1]!.key).toBe('n:119')
    // Only the ahead source has 119/120.
    expect(merged[1]!.variants.map((v) => v.siteId)).toEqual(['b'])
    // Both have 118, primary source first.
    expect(merged[2]!.key).toBe('n:118')
    expect(merged[2]!.variants.map((v) => v.siteId)).toEqual(['a', 'b'])
  })

  test('chapters only a shorter source has are prepended', () => {
    const spine = src('a', ['第5章', '第4章', '第3章'])
    const extra = src('b', ['序章 上'])
    const merged = mergeSourceChapters([spine, extra], '')

    expect(merged.map((c) => c.key)).toEqual(['t:序章上', 'n:5', 'n:4', 'n:3'])
  })

  test('extras from several sources are ordered by how far each source reaches', () => {
    const spine = src('a', numbered(46, 50))
    const far = src('b', ['番外3', '番外2', '番外1'])
    const near = src('c', ['后记2', '后记1'])
    const merged = mergeSourceChapters([spine, near, far], '')

    expect(merged.map((c) => c.title)).toEqual([
      '番外3',
      '番外2',
      '番外1',
      '后记2',
      '后记1',
      '第50章',
      '第49章',
      '第48章',
      '第47章',
      '第46章',
    ])
  })

  test('a chapter repeated within one source is emitted once', () => {
    const merged = mergeSourceChapters([src('a', ['第3章', '第3章', '第2章'])], '')
    expect(merged.map((c) => c.key)).toEqual(['n:3', 'n:2'])
  })

  test('a numbered source and an unnumbered source merge by title text', () => {
    const numbered_source = src('a', ['第118章 夜奔', '第117章 雨落'])
    const plain = src('b', ['夜奔'])
    const merged = mergeSourceChapters([numbered_source, plain], '')

    expect(merged).toHaveLength(2)
    expect(merged[0]!.variants.map((v) => v.siteId)).toEqual(['a', 'b'])
  })

  test('an unnumbered source listed first still merges with a numbered one', () => {
    const merged = mergeSourceChapters([src('a', ['夜奔']), src('b', ['第118章 夜奔'])], '')
    expect(merged).toHaveLength(1)
    expect(merged[0]!.variants.map((v) => v.siteId)).toEqual(['a', 'b'])
  })

  test('numbered chapters sharing a title text stay separate', () => {
    const merged = mergeSourceChapters([src('a', ['第2章 无题', '第1章 无题'])], '')
    expect(merged.map((c) => c.key)).toEqual(['n:2', 'n:1'])
  })

  test('title comes from the primary source, timestamp from the first source that has one', () => {
    const primary = src('a', ['第5章 甲'], [0])
    const secondary = src('b', ['第5章 乙'], [500])
    const merged = mergeSourceChapters([primary, secondary], '')

    expect(merged[0]!.title).toBe('第5章 甲')
    expect(merged[0]!.postedAt).toBe(500)
  })

  test('trims to the last-read chapter', () => {
    const merged = mergeSourceChapters([src('a', numbered(1, 5))], 'n:2')
    expect(merged.map((c) => c.key)).toEqual(['n:5', 'n:4', 'n:3', 'n:2'])
  })

  test('an unknown seen key keeps the whole list', () => {
    const merged = mergeSourceChapters([src('a', numbered(1, 5))], 'n:99')
    expect(merged).toHaveLength(5)
  })

  test('collapses a long unread run by default', () => {
    const merged = mergeSourceChapters([src('a', numbered(1, 30))], '')
    expect(merged).toHaveLength(21)
    expect(merged[10]!.omittedCount).toBe(10)
  })

  test('maxWindow option truncates the merged output newest-first', () => {
    const merged = mergeSourceChapters([src('a', numbered(1, 30))], '', { maxWindow: 10 })
    expect(merged.map((c) => c.key)).toEqual([
      'n:30',
      'n:29',
      'n:28',
      'n:27',
      'n:26',
      'n:25',
      'n:24',
      'n:23',
      'n:22',
      'n:21',
    ])
  })

  test('merges large inputs correctly (findIndex → Map, no O(n²) regression)', () => {
    // 2 sources × 500 numbered chapters = 1000 nodes. Verifies the variant→nodeIdx
    // map keeps merge correct at scale (and does not time out). Collapse is
    // disabled so we assert on the raw merged stream length.
    const merged = mergedRaw([src('a', numbered(1, 500)), src('b', numbered(1, 500))])
    expect(merged).toHaveLength(500)
    expect(merged[0]!.key).toBe('n:500')
    expect(merged[0]!.variants.map((v) => v.siteId).sort()).toEqual(['a', 'b'])
    expect(merged[499]!.key).toBe('n:1')
  })
})

describe('windowLatestChapters', () => {
  function ch(key: string): NovelChapter {
    return { key, number: undefined, title: key, postedAt: 0, variants: [] }
  }

  test('Infinity leaves the list unchanged', () => {
    const list = [ch('n:3'), ch('n:2'), ch('n:1')]
    expect(windowLatestChapters(list, '', Number.POSITIVE_INFINITY)).toBe(list)
  })

  test('finite window truncates newest-first', () => {
    const list = [ch('n:5'), ch('n:4'), ch('n:3'), ch('n:2'), ch('n:1')]
    const out = windowLatestChapters(list, '', 3)
    expect(out.map((c) => c.key)).toEqual(['n:5', 'n:4', 'n:3'])
  })

  test('empty seenKey windows without preserving anything', () => {
    const list = [ch('n:5'), ch('n:4'), ch('n:3'), ch('n:2'), ch('n:1')]
    expect(windowLatestChapters(list, '', 2).map((c) => c.key)).toEqual(['n:5', 'n:4'])
  })

  test('seen boundary outside the window is preserved at the end', () => {
    const list = [ch('n:5'), ch('n:4'), ch('n:3'), ch('n:2'), ch('n:1')]
    const out = windowLatestChapters(list, 'n:1', 3)
    expect(out.map((c) => c.key)).toEqual(['n:5', 'n:4', 'n:3', 'n:1'])
  })

  test('seen boundary inside the window needs no extra append', () => {
    const list = [ch('n:5'), ch('n:4'), ch('n:3'), ch('n:2'), ch('n:1')]
    const out = windowLatestChapters(list, 'n:4', 3)
    expect(out.map((c) => c.key)).toEqual(['n:5', 'n:4', 'n:3'])
  })
})

describe('collapseChapters', () => {
  test('leaves short runs untouched', () => {
    const chapters = mergeSourceChapters([src('a', numbered(1, 5))], '')
    expect(collapseChapters(chapters, '', { collapseThreshold: 20 })).toHaveLength(5)
  })

  test('keeps newest and oldest around a gap, plus the seen boundary', () => {
    const chapters = mergedRaw([src('a', numbered(1, 30))])
    const collapsed = collapseChapters(chapters, 'n:1', { collapseThreshold: 20, collapseKeep: 10 })

    expect(collapsed).toHaveLength(22)
    expect(collapsed[10]!.omittedCount).toBe(9)
    expect(collapsed.at(-1)!.key).toBe('n:1')
    expect(collapsed[0]!.key).toBe('n:30')
    expect(collapsed[9]!.key).toBe('n:21')
    expect(collapsed[11]!.key).toBe('n:11')
  })
})
