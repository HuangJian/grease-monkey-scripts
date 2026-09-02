import { describe, expect, test } from 'bun:test'
import { collapseChapters, mergeSourceChapters } from '../../../src/prism/novels/merge'
import type { NovelChapterVariant } from '../../../src/prism/novels/types'

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
