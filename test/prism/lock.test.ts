import { describe, expect, test } from 'bun:test'
import { tryAcquireLock } from '../../src/prism/lock'
import { LOCK_KEY, type Lock } from '../../src/prism/types'
import { createRuntime } from '../runtime'

describe('tryAcquireLock', () => {
  test('acquires lock when none exists', async () => {
    const runtime = createRuntime()
    const acquired = await tryAcquireLock(runtime, 'v2ex', { newId: () => 'me' })
    expect(acquired).toBe(true)
    const stored = runtime.stores[LOCK_KEY('v2ex')] as Lock
    expect(stored.owner).toBe('me')
  })
  test('fails when an active lock is held', async () => {
    const runtime = createRuntime()
    const now = 1_000_000
    runtime.stores[LOCK_KEY('v2ex')] = { owner: 'other', expiresAt: now + 60_000 }
    const acquired = await tryAcquireLock(runtime, 'v2ex', { now: () => now, newId: () => 'me' })
    expect(acquired).toBe(false)
  })
  test('succeeds when prior lock has expired', async () => {
    const runtime = createRuntime()
    const now = 1_000_000
    runtime.stores[LOCK_KEY('v2ex')] = { owner: 'other', expiresAt: now - 1 }
    const acquired = await tryAcquireLock(runtime, 'v2ex', { now: () => now, newId: () => 'me' })
    expect(acquired).toBe(true)
  })
  test('fails when another tab grabbed the lock in between', async () => {
    const runtime = createRuntime()
    const realSetValue = runtime.setValue
    runtime.setValue = (key, value) => {
      realSetValue(key, value)
      if (key === LOCK_KEY('v2ex')) {
        runtime.stores[key] = { owner: 'sneaky', expiresAt: Date.now() + 60_000 }
      }
    }
    const acquired = await tryAcquireLock(runtime, 'v2ex', { newId: () => 'me' })
    expect(acquired).toBe(false)
  })
  test('honors custom TTL', async () => {
    const runtime = createRuntime()
    const now = 1_000_000
    await tryAcquireLock(runtime, 'v2ex', { ttlMs: 5000, now: () => now, newId: () => 'me' })
    const stored = runtime.stores[LOCK_KEY('v2ex')] as Lock
    expect(stored.expiresAt).toBe(now + 5000)
  })
})
