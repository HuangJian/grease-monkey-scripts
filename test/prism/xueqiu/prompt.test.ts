import { describe, expect, test } from 'bun:test'
import { buildSystemPrompt, buildUserPrompt, stripHtml } from '../../../src/prism/xueqiu/ai/prompt'
import type { XueqiuNewsItem } from '../../../src/prism/xueqiu/types'

function makeItem(id: number, text: string): XueqiuNewsItem {
  return {
    id,
    title: `Title ${id}`,
    description: '',
    text,
    target: `/status/${id}`,
    created_at: id * 1000,
    status_id: id,
    reply_count: 0,
    like_count: 0,
    share_count: 0,
    view_count: 0,
    sub_type: 0,
  }
}

describe('stripHtml', () => {
  test('strips HTML tags', () => {
    expect(stripHtml('<p>hello</p>')).toBe('hello')
    expect(stripHtml('<a href="x">link</a>')).toBe('link')
  })

  test('decodes HTML entities', () => {
    expect(stripHtml('&amp;&lt;&gt;&quot;&#39;')).toBe('&<>"\'')
  })

  test('collapses whitespace', () => {
    expect(stripHtml('  hello   world  ')).toBe('hello world')
  })

  test('handles empty string', () => {
    expect(stripHtml('')).toBe('')
  })
})

describe('buildSystemPrompt', () => {
  test('default prompt contains key rules', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('15-20')
    expect(prompt).toContain('items')
    expect(prompt).toContain('importance')
    expect(prompt).toContain('禁止将同一条新闻归入多个主题')
  })

  test('default prompt JSON example includes items for all importance levels', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('"i":"low","items":"2,8,12"')
  })

  test('returns override when provided', () => {
    const custom = '自定义 prompt'
    expect(buildSystemPrompt(custom)).toBe(custom)
  })

  test('falls back to default when override is empty', () => {
    expect(buildSystemPrompt('')).toContain('15-20')
    expect(buildSystemPrompt('   ')).toContain('15-20')
  })
})

describe('buildUserPrompt', () => {
  test('produces compact JSON with sequential indices', () => {
    const items = [makeItem(100, '新闻A'), makeItem(200, '新闻B')]
    const prompt = buildUserPrompt(items)
    expect(prompt).toContain('"i":0,"x":"新闻A"')
    expect(prompt).toContain('"i":1,"x":"新闻B"')
    expect(prompt).toContain('共 2 条')
  })

  test('strips HTML from item text', () => {
    const items = [makeItem(1, '<b>bold</b> text')]
    const prompt = buildUserPrompt(items)
    expect(prompt).toContain('"x":"bold text"')
    expect(prompt).not.toContain('<b>')
  })

  test('handles empty items', () => {
    const prompt = buildUserPrompt([])
    expect(prompt).toContain('共 0 条')
  })
})
