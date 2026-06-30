import { describe, expect, test } from 'bun:test'
import {
  computeBackoffMs,
  refreshSource,
  runOpportunisticRefresh,
} from '../../src/prism/app/refresh'
import {
  BACKOFF_DELAYS_MS,
  CACHE_KEY,
  CACHE_SCHEMA_VERSION,
  type CachedSource,
} from '../../src/prism/types'
import { createRuntime } from '../runtime'
import type { Source } from '../../src/prism/types'

function makeSource(overrides: Partial<Source<unknown>>): Source<unknown> {
  return {
    id: 'test',
    title: 'Test',
    ttlMs: 60_000,
    fetch: async () => [],
    ...overrides,
  } as unknown as Source<unknown>
}

function staleCache(overrides: Partial<CachedSource<unknown>> = {}): CachedSource<unknown> {
  return {
    schemaVersion: CACHE_SCHEMA_VERSION,
    data: null,
    error: '',
    fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
    ...overrides,
  }
}

describe('computeBackoffMs', () => {
  test('0 for zero or negative failure count', () => {
    expect(computeBackoffMs(0)).toBe(0)
    expect(computeBackoffMs(-1)).toBe(0)
  })
  test('matches BACKOFF_DELAYS_MS for first N failures', () => {
    BACKOFF_DELAYS_MS.forEach((delay, i) => {
      expect(computeBackoffMs(i + 1)).toBe(delay)
    })
  })
  test('caps at last delay for excessive failure count', () => {
    expect(computeBackoffMs(BACKOFF_DELAYS_MS.length + 1)).toBe(
      BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1],
    )
    expect(computeBackoffMs(100)).toBe(BACKOFF_DELAYS_MS[BACKOFF_DELAYS_MS.length - 1])
  })
})

describe('refreshSource failure backoff', () => {
  test('sets failureCount=1 and nextRetryAt on first failure', async () => {
    const runtime = createRuntime()
    runtime.stores[CACHE_KEY('test')] = staleCache()
    const source = makeSource({ fetch: async () => Promise.reject(new Error('network down')) })
    await refreshSource(runtime, source)
    const stored = runtime.stores[CACHE_KEY('test')] as CachedSource<unknown>
    expect(stored.error).toBe('network down')
    expect(stored.failureCount).toBe(1)
    expect(stored.nextRetryAt).toBeGreaterThan(Date.now() - 1000)
    expect(stored.nextRetryAt).toBeLessThanOrEqual(Date.now() + BACKOFF_DELAYS_MS[0]! + 1000)
    expect(stored.attemptedAt).toBeGreaterThan(stored.fetchedAt)
  })

  test('increments failureCount on consecutive failures', async () => {
    const runtime = createRuntime()
    runtime.stores[CACHE_KEY('test')] = staleCache({ failureCount: 2 })
    const source = makeSource({ fetch: async () => Promise.reject(new Error('still down')) })
    await refreshSource(runtime, source)
    const stored = runtime.stores[CACHE_KEY('test')] as CachedSource<unknown>
    expect(stored.failureCount).toBe(3)
    expect(stored.nextRetryAt).toBeGreaterThan(Date.now() + BACKOFF_DELAYS_MS[1]! - 1000)
  })

  test('preserves old fetchedAt on failure', async () => {
    const runtime = createRuntime()
    const oldFetchedAt = Date.now() - 3 * 60 * 60 * 1000
    runtime.stores[CACHE_KEY('test')] = staleCache({ fetchedAt: oldFetchedAt })
    const source = makeSource({ fetch: async () => Promise.reject(new Error('fail')) })
    await refreshSource(runtime, source)
    const stored = runtime.stores[CACHE_KEY('test')] as CachedSource<unknown>
    expect(stored.fetchedAt).toBe(oldFetchedAt)
  })

  test('clears backoff fields on success', async () => {
    const runtime = createRuntime()
    runtime.stores[CACHE_KEY('test')] = staleCache({
      failureCount: 3,
      nextRetryAt: Date.now() + 300_000,
      attemptedAt: Date.now() - 60_000,
    })
    const source = makeSource({ fetch: async () => ['item1'] })
    await refreshSource(runtime, source)
    const stored = runtime.stores[CACHE_KEY('test')] as CachedSource<unknown>
    expect(stored.error).toBe('')
    expect(stored.failureCount).toBeUndefined()
    expect(stored.nextRetryAt).toBeUndefined()
    expect(stored.attemptedAt).toBeUndefined()
  })
})

describe('runOpportunisticRefresh backoff skip', () => {
  test('skips stale source that is in backoff', async () => {
    const runtime = createRuntime()
    runtime.stores[CACHE_KEY('test')] = staleCache({
      nextRetryAt: Date.now() + 120_000,
      failureCount: 2,
    })
    let fetchCalled = false
    const source = makeSource({ fetch: async () => ((fetchCalled = true), []) })
    await runOpportunisticRefresh(runtime, [source], async () => {
      fetchCalled = true
    })
    expect(fetchCalled).toBe(false)
  })

  test('refreshes stale source whose backoff has elapsed', async () => {
    const runtime = createRuntime()
    runtime.stores[CACHE_KEY('test')] = staleCache({
      nextRetryAt: Date.now() - 1000,
      failureCount: 2,
    })
    let refreshed = false
    const source = makeSource({ fetch: async () => [] })
    await runOpportunisticRefresh(runtime, [source], async () => {
      refreshed = true
    })
    expect(refreshed).toBe(true)
  })

  test('refreshes stale source with no backoff history', async () => {
    const runtime = createRuntime()
    runtime.stores[CACHE_KEY('test')] = staleCache()
    let refreshed = false
    const source = makeSource({ fetch: async () => [] })
    await runOpportunisticRefresh(runtime, [source], async () => {
      refreshed = true
    })
    expect(refreshed).toBe(true)
  })
})
