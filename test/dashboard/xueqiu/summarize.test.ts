import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createRuntime, type TestRuntime } from '../../runtime'
import {
  parseSummary,
  loadSummaries,
  saveSummary,
  buildSummaryEntry,
  type SummarizeResult,
} from '../../../src/dashboard/xueqiu/ai/summarize'
import type { SummaryEntry } from '../../../src/dashboard/xueqiu/types'

describe('parseSummary', () => {
  test('parses compact JSON with short keys', () => {
    const content = JSON.stringify({
      topics: [
        { c: '宏观', t: '美联储加息', s: '摘要内容', i: 'high', items: '0,3,5' },
        { c: '科技', t: 'AI芯片', s: '另一摘要', i: 'low', items: '1,2' },
      ],
    })
    const topics = parseSummary(content, 10)
    expect(topics).toHaveLength(2)
    expect(topics[0]!.category).toBe('宏观')
    expect(topics[0]!.title).toBe('美联储加息')
    expect(topics[0]!.importance).toBe('high')
    expect(topics[0]!.items).toEqual([0, 3, 5])
    expect(topics[1]!.items).toEqual([1, 2])
  })

  test('parses markdown code block wrapped JSON', () => {
    const content =
      '```json\n{"topics":[{"c":"测试","t":"标题","s":"摘要","i":"medium","items":"0"}]}\n```'
    const topics = parseSummary(content, 5)
    expect(topics).toHaveLength(1)
    expect(topics[0]!.category).toBe('测试')
    expect(topics[0]!.items).toEqual([0])
  })

  test('returns empty for invalid JSON', () => {
    expect(parseSummary('not json at all', 10)).toEqual([])
  })

  test('returns empty for null content', () => {
    expect(parseSummary('', 10)).toEqual([])
  })

  test('filters out-of-range indices', () => {
    const content = JSON.stringify({
      topics: [{ c: 'x', t: 'y', s: 'z', i: 'high', items: '0,99,2,-1' }],
    })
    const topics = parseSummary(content, 5)
    expect(topics[0]!.items).toEqual([0, 2])
  })

  test('handles missing items field', () => {
    const content = JSON.stringify({
      topics: [{ c: 'x', t: 'y', s: 'z', i: 'low' }],
    })
    const topics = parseSummary(content, 5)
    expect(topics[0]!.items).toEqual([])
  })

  test('handles legacy long key format', () => {
    const content = JSON.stringify({
      topics: [
        { category: '宏观', title: '加息', summary: '内容', importance: 'high', items: '0,1' },
      ],
    })
    const topics = parseSummary(content, 5)
    expect(topics[0]!.category).toBe('宏观')
    expect(topics[0]!.title).toBe('加息')
    expect(topics[0]!.importance).toBe('high')
  })
})

describe('buildSummaryEntry', () => {
  test('computes newsCount from deduplicated items', () => {
    const result: SummarizeResult = {
      topics: [
        { category: 'a', title: 't1', summary: 's1', importance: 'high', items: [1, 2, 3] },
        { category: 'b', title: 't2', summary: 's2', importance: 'medium', items: [2, 3, 4] },
      ],
      elapsedMs: 5000,
      itemCount: 5,
    }
    const entry = buildSummaryEntry(result)
    expect(entry.newsCount).toBe(4) // 1,2,3,4 deduplicated
    expect(entry.itemCount).toBe(5)
    expect(entry.elapsedMs).toBe(5000)
    expect(entry.topics).toBe(result.topics)
    expect(entry.id).toBeTruthy()
    expect(entry.generatedAt).toBeGreaterThan(0)
  })

  test('handles empty topics', () => {
    const result: SummarizeResult = {
      topics: [],
      elapsedMs: 1000,
      itemCount: 0,
    }
    const entry = buildSummaryEntry(result)
    expect(entry.newsCount).toBe(0)
  })
})

describe('summary storage (loadSummaries / saveSummary)', () => {
  let runtime: TestRuntime

  beforeEach(() => {
    runtime = createRuntime()
  })

  afterEach(() => {
    runtime.stores = {}
  })

  test('loadSummaries returns empty when nothing stored', async () => {
    const result = await loadSummaries(runtime, 60000)
    expect(result).toEqual([])
  })

  test('saveSummary prepends to list', async () => {
    const now = Date.now()
    const entry1: SummaryEntry = {
      id: '1',
      generatedAt: now - 1000,
      topics: [],
      newsCount: 0,
      itemCount: 0,
      elapsedMs: 0,
    }
    const entry2: SummaryEntry = {
      id: '2',
      generatedAt: now,
      topics: [],
      newsCount: 0,
      itemCount: 0,
      elapsedMs: 0,
    }

    await saveSummary(runtime, entry1)
    await saveSummary(runtime, entry2)

    const result = await loadSummaries(runtime, 60000)
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('2') // newest first
    expect(result[1]!.id).toBe('1')
  })

  test('loadSummaries filters expired entries', async () => {
    const now = Date.now()
    const old: SummaryEntry = {
      id: 'old',
      generatedAt: now - 100_000,
      topics: [],
      newsCount: 0,
      itemCount: 0,
      elapsedMs: 0,
    }
    const recent: SummaryEntry = {
      id: 'recent',
      generatedAt: now - 1000,
      topics: [],
      newsCount: 0,
      itemCount: 0,
      elapsedMs: 0,
    }

    await saveSummary(runtime, old)
    await saveSummary(runtime, recent)

    // retentionMs = 50000 → old (100000 ago) should be filtered out
    const result = await loadSummaries(runtime, 50_000)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('recent')
  })
})
