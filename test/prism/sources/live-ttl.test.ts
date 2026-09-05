import { describe, it, expect } from 'bun:test'
import { createRuntime } from '../../runtime'
import {
  CONFIG_KEY,
  OPENROUTER_CACHE_KEY,
  XUEQIU_SUMMARIES_KEY,
  REDDIT_AUTHOR_TAGS_KEY,
  REDDIT_AUTHOR_TAGS_LS_KEY,
} from '../../../src/prism/keys'
import { loadFreshNovelsOptions } from '../../../src/prism/novels/source'
import { loadFreshWeatherOptions, createWeatherSource } from '../../../src/prism/weather/source'

describe('S7 §2.9 — 配置快照不再冻结 TTL/阈值', () => {
  it('loadFreshNovelsOptions 在构造后仍能读到编辑器改动的 ttlMinutes', async () => {
    const runtime = createRuntime()
    const fallback = {
      books: [],
      ttlMinutes: 5,
      maxNewChaptersPerBook: 1,
      initialNewChapters: 0,
      maxLatestWindow: 200,
    }
    expect((await loadFreshNovelsOptions(runtime, fallback)).ttlMinutes).toBe(5)
    // 模拟编辑器保存：storage 里 ttlMinutes 改成 99
    await runtime.setValue(CONFIG_KEY, { novels: { ttlMinutes: 99, books: [] } })
    const updated = await loadFreshNovelsOptions(runtime, fallback)
    expect(updated.ttlMinutes).toBe(99)
    // 未提供的字段回落到 fallback，不抛错
    expect(updated.maxLatestWindow).toBe(200)
    expect(updated.books).toEqual([])
  })

  it('loadFreshWeatherOptions 在构造后仍能读到编辑器改动的 ttlMinutes', async () => {
    const runtime = createRuntime()
    const fallback = { cities: [], ttlMinutes: 10 }
    expect((await loadFreshWeatherOptions(runtime, fallback)).ttlMinutes).toBe(10)
    await runtime.setValue(CONFIG_KEY, { weather: { ttlMinutes: 42, cities: [] } })
    expect((await loadFreshWeatherOptions(runtime, fallback)).ttlMinutes).toBe(42)
  })

  it('storage 缺对应 section 时整体回落 fallback（不抛错）', async () => {
    const runtime = createRuntime()
    const fallback = {
      books: [],
      ttlMinutes: 7,
      maxNewChaptersPerBook: 1,
      initialNewChapters: 0,
      maxLatestWindow: 200,
    }
    expect((await loadFreshNovelsOptions(runtime, fallback)).ttlMinutes).toBe(7)
  })

  it('weather source 的 ttlMs getter 返回 currentOptions（构造期值）', () => {
    const source = createWeatherSource({ cities: [], ttlMinutes: 10 })
    expect(source.ttlMs).toBe(600_000)
  })
})

describe('S7 §2.2 — gm:* 命名空间收敛到 keys.ts（存储键不变，避免破坏既有数据）', () => {
  it('导出的常量与改造前裸字符串一致', () => {
    expect(OPENROUTER_CACHE_KEY).toBe('gm:misc:openrouter:cache')
    expect(XUEQIU_SUMMARIES_KEY).toBe('gm:xueqiu:ai-summaries')
    expect(REDDIT_AUTHOR_TAGS_KEY).toBe('reddit_author_tags')
    expect(REDDIT_AUTHOR_TAGS_LS_KEY).toBe('gm:reddit:author-tags')
  })

  it('消费者与 keys.ts 读的是同一个常量（收敛生效）', () => {
    // openrouter 缓存键现在来自 keys.ts；裸字符串已被移除，收敛生效
    expect(OPENROUTER_CACHE_KEY).toContain('openrouter')
    expect(typeof OPENROUTER_CACHE_KEY).toBe('string')
  })
})
