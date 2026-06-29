import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createXueqiuState } from '../../../src/prism/xueqiu/state'
import type { XueqiuState } from '../../../src/prism/xueqiu/state'
import type { XueqiuNewsItem } from '../../../src/prism/xueqiu/types'

function makeItem(id: number, created_at: number = Date.now()): XueqiuNewsItem {
  return {
    id,
    title: `Item ${id}`,
    description: '',
    text: '',
    target: `/status/${id}`,
    created_at,
    status_id: id,
    reply_count: 0,
    like_count: 0,
    share_count: 0,
    view_count: 0,
    sub_type: 0,
  }
}

describe('xueqiu unread filter with expand', () => {
  let state: XueqiuState

  beforeEach(() => {
    state = createXueqiuState({ retentionMs: 7 * 24 * 60 * 60 * 1000 })
  })

  afterEach(() => {
    state.clear()
  })

  test('bugfix: expanded item stays visible when dateFilter is 未 and item is read', () => {
    const item = makeItem(1)
    const items = [item]

    state.markRead(String(item.id))
    state.setExpanded(String(item.id), true)

    const filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe(1)
  })

  test('read non-expanded item is excluded by 未 filter', () => {
    const item = makeItem(1)
    const items = [item]

    state.markRead(String(item.id))

    const filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })

    expect(filtered).toHaveLength(0)
  })

  test('unread item is included by 未 filter regardless of expanded state', () => {
    const item = makeItem(1)
    const items = [item]

    const filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })

    expect(filtered).toHaveLength(1)
  })

  test('collapsing a read item removes it from 未 filter results', () => {
    const item = makeItem(1)
    const items = [item]

    state.markRead(String(item.id))
    state.setExpanded(String(item.id), true)

    let filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })
    expect(filtered).toHaveLength(1)

    state.setExpanded(String(item.id), false)

    filtered = items.filter((it) => {
      const id = String(it.id)
      return !state.isRead(id) || state.isExpanded(id)
    })
    expect(filtered).toHaveLength(0)
  })
})
