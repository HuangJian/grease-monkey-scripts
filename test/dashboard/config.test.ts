import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { DEFAULT_CONFIG, deepMerge, isPlainObject, loadConfig } from '../../src/dashboard/config'
import {
  CACHE_KEY,
  CONFIG_KEY,
  CACHE_SCHEMA_VERSION,
  type CachedSource,
} from '../../src/dashboard/types'
import {
  estimateByteSize,
  isStale,
  isVeryStale,
  loadCache,
  saveCache,
} from '../../src/dashboard/cache'
import { createRuntime } from '../runtime'

describe('isPlainObject', () => {
  test('true for plain objects', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
  })
  test('false for arrays, null, primitives', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject(null)).toBe(false)
    expect(isPlainObject('a')).toBe(false)
    expect(isPlainObject(1)).toBe(false)
  })
})

describe('deepMerge', () => {
  test('overrides scalar values', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 })
  })
  test('recursively merges nested objects', () => {
    const merged = deepMerge(
      { weather: { lat: 1, lon: 2, city: 'BJ' } },
      { weather: { city: 'SH', lat: 3 } },
    )
    expect(merged).toEqual({ weather: { lat: 3, lon: 2, city: 'SH' } })
  })
  test('arrays in override replace arrays in base', () => {
    const merged = deepMerge({ a: [1, 2, 3] }, { a: [4] })
    expect(merged).toEqual({ a: [4] })
  })
  test('undefined values in override are ignored', () => {
    expect(deepMerge({ a: 1 }, { a: undefined })).toEqual({ a: 1 })
  })
  test('null in base returns override', () => {
    expect(deepMerge({ a: null as null | { b: number } }, { a: { b: 1 } })).toEqual({
      a: { b: 1 },
    })
  })
})

describe('loadConfig', () => {
  test('returns DEFAULT_CONFIG when nothing stored', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    const cfg = await loadConfig(runtime)
    expect(cfg).toEqual(DEFAULT_CONFIG)
  })
  test('merges user override with defaults', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    runtime.stores[CONFIG_KEY] = { weather: { cityLabel: 'SH' } }
    const cfg = await loadConfig(runtime)
    expect(cfg.weather.cityLabel).toBe('SH')
    expect(cfg.weather.latitude).toBe(DEFAULT_CONFIG.weather.latitude)
    expect(cfg.v2ex.ttlMinutes).toBe(DEFAULT_CONFIG.v2ex.ttlMinutes)
  })
})

describe('cache load/save', () => {
  test('loadCache returns null for missing data', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    expect(await loadCache<unknown>(runtime, 'v2ex')).toBeNull()
  })
  test('loadCache returns null for malformed entries', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    runtime.stores[CACHE_KEY('v2ex')] = { data: 'x' }
    expect(await loadCache<unknown>(runtime, 'v2ex')).toBeNull()
  })
  test('loadCache returns null when schemaVersion is missing or mismatched', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    runtime.stores[CACHE_KEY('v2ex')] = { fetchedAt: 1234 }
    expect(await loadCache<unknown>(runtime, 'v2ex')).toBeNull()
    runtime.stores[CACHE_KEY('v2ex')] = {
      schemaVersion: CACHE_SCHEMA_VERSION + 99,
      fetchedAt: 1234,
    }
    expect(await loadCache<unknown>(runtime, 'v2ex')).toBeNull()
  })
  test('saveCache then loadCache round-trips with schemaVersion + byteSize', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    const result = await saveCache<{ a: number }>(runtime, 'v2ex', {
      data: { a: 1 },
      fetchedAt: 1234,
    })
    expect(result).toBe('ok')
    const loaded = await loadCache<{ a: number }>(runtime, 'v2ex')
    expect(loaded).not.toBeNull()
    expect(loaded!.schemaVersion).toBe(CACHE_SCHEMA_VERSION)
    expect(loaded!.byteSize).toBeGreaterThan(0)
    expect(loaded!.data).toEqual({ a: 1 })
    expect(loaded!.fetchedAt).toBe(1234)
  })
  test('saveCache returns quota_exceeded and skips write when payload > 50KB', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    const big = 'x'.repeat(60 * 1024)
    const result = await saveCache<{ s: string }>(runtime, 'v2ex', {
      data: { s: big },
      fetchedAt: Date.now(),
    })
    expect(result).toBe('quota_exceeded')
    expect(runtime.stores[CACHE_KEY('v2ex')]).toBeUndefined()
  })
  test('estimateByteSize returns JSON size', () => {
    expect(estimateByteSize({ a: 1 })).toBe(7)
  })
})

describe('staleness', () => {
  const ttlMs = 60_000
  const v = (fetchedAt: number): CachedSource<unknown> => ({
    schemaVersion: CACHE_SCHEMA_VERSION,
    fetchedAt,
    byteSize: 0,
  })
  test('isStale: missing cache is stale', () => {
    expect(isStale(null, ttlMs, 1_000_000)).toBe(true)
  })
  test('isStale: within TTL is fresh', () => {
    expect(isStale(v(1_000_000 - 30_000), ttlMs, 1_000_000)).toBe(false)
  })
  test('isStale: beyond TTL is stale', () => {
    expect(isStale(v(1_000_000 - 90_000), ttlMs, 1_000_000)).toBe(true)
  })
  test('isVeryStale: missing cache is not very stale', () => {
    expect(isVeryStale(null, ttlMs, 1_000_000)).toBe(false)
  })
  test('isVeryStale: 3x TTL triggers', () => {
    expect(isVeryStale(v(1_000_000 - 181_000), ttlMs, 1_000_000)).toBe(true)
  })
  test('isVeryStale: just under 3x TTL does not trigger', () => {
    expect(isVeryStale(v(1_000_000 - 179_000), ttlMs, 1_000_000)).toBe(false)
  })
})
