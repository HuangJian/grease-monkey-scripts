import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  DEFAULT_CONFIG,
  deepMerge,
  isPlainObject,
  loadConfig,
  loadConfigSection,
  validateConfig,
} from '../../src/dashboard/config'
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
    runtime.stores[CONFIG_KEY] = {
      weather: { cities: [{ latitude: 31.2, longitude: 121.5, cityLabel: 'SH' }] },
    }
    const cfg = await loadConfig(runtime)
    expect(cfg.weather.cities[0].cityLabel).toBe('SH')
    expect(cfg.weather.cities[0].latitude).toBe(31.2)
    expect(cfg.v2ex.ttlMinutes).toBe(DEFAULT_CONFIG.v2ex.ttlMinutes)
  })
})

describe('loadConfigSection', () => {
  type Opts = { minItems: number; maxItems: number }
  const fallback: Opts = { minItems: 10, maxItems: 30 }
  const coerce = (raw: Record<string, unknown>): Opts => ({
    minItems: typeof raw['minItems'] === 'number' ? (raw['minItems'] as number) : fallback.minItems,
    maxItems: typeof raw['maxItems'] === 'number' ? (raw['maxItems'] as number) : fallback.maxItems,
  })

  test('returns fallback when nothing stored', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    const out = await loadConfigSection(runtime, 'v2ex', fallback, coerce)
    expect(out).toEqual(fallback)
  })
  test('returns fallback when section key is missing', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    runtime.stores[CONFIG_KEY] = { weather: {} }
    const out = await loadConfigSection(runtime, 'v2ex', fallback, coerce)
    expect(out).toEqual(fallback)
  })
  test('returns fallback when section is not a plain object', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    runtime.stores[CONFIG_KEY] = { v2ex: [1, 2, 3] }
    const out = await loadConfigSection(runtime, 'v2ex', fallback, coerce)
    expect(out).toEqual(fallback)
  })
  test('passes section through coerce and returns coerced result', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    runtime.stores[CONFIG_KEY] = { v2ex: { minItems: 5, maxItems: 50, extra: 'ignored' } }
    const out = await loadConfigSection(runtime, 'v2ex', fallback, coerce)
    expect(out).toEqual({ minItems: 5, maxItems: 50 })
  })
  test('returns fallback when runtime.getValue throws', async () => {
    const dom = new JSDOM('<html></html>')
    const base = createRuntime(dom)
    const failingRuntime = { ...base, getValue: () => Promise.reject(new Error('boom')) }
    const out = await loadConfigSection(failingRuntime as never, 'v2ex', fallback, coerce)
    expect(out).toEqual(fallback)
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
  test('saveCache writes payloads of any size', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = createRuntime(dom)
    const big = 'x'.repeat(60 * 1024)
    const result = await saveCache<{ s: string }>(runtime, 'v2ex', {
      data: { s: big },
      fetchedAt: Date.now(),
    })
    expect(result).toBe('ok')
    const stored = runtime.stores[CACHE_KEY('v2ex')] as CachedSource<{ s: string }>
    expect(stored.data?.s.length).toBe(60 * 1024)
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

describe('validateConfig.tnews', () => {
  test('default tnews config is valid', () => {
    expect(validateConfig({ tnews: DEFAULT_CONFIG.tnews })).toEqual({ ok: true })
  })
  test('rejects non-object tnews', () => {
    expect(validateConfig({ tnews: 'no' }).ok).toBe(false)
  })
  test('rejects empty feeds', () => {
    expect(
      validateConfig({ tnews: { feeds: [], mirrors: [], ttlMinutes: 30, maxItems: 30 } }).ok,
    ).toBe(false)
  })
  test('rejects invalid feed URL', () => {
    expect(
      validateConfig({
        tnews: { feeds: ['not a url'], mirrors: [], ttlMinutes: 30, maxItems: 30 },
      }).ok,
    ).toBe(false)
  })
  test('rejects blank feed entry', () => {
    expect(
      validateConfig({
        tnews: { feeds: ['  '], mirrors: [], ttlMinutes: 30, maxItems: 30 },
      }).ok,
    ).toBe(false)
  })
  test('rejects invalid mirror hostname', () => {
    expect(
      validateConfig({
        tnews: {
          feeds: ['https://x.com'],
          mirrors: ['bad host!'],
          ttlMinutes: 30,
          maxItems: 30,
        },
      }).ok,
    ).toBe(false)
  })
  test('rejects non-array mirrors', () => {
    expect(
      validateConfig({
        tnews: { feeds: ['https://x.com'], mirrors: 'nope', ttlMinutes: 30, maxItems: 30 },
      }).ok,
    ).toBe(false)
  })
  test('rejects ttlMinutes = 0', () => {
    expect(
      validateConfig({
        tnews: { feeds: ['https://x.com'], mirrors: [], ttlMinutes: 0, maxItems: 30 },
      }).ok,
    ).toBe(false)
  })
  test('rejects maxItems = 0', () => {
    expect(
      validateConfig({
        tnews: { feeds: ['https://x.com'], mirrors: [], ttlMinutes: 30, maxItems: 0 },
      }).ok,
    ).toBe(false)
  })
})
