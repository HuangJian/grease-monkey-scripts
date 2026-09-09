import { describe, expect, test } from 'bun:test'
import { tryAcquireLock, releaseLock } from '../../src/prism/lock'
import { LOCK_KEY, LOCK_TTL_MS, type Lock } from '../../src/prism/types'
import { createRuntime } from '../runtime'

/** Let the two internal awaits (getValue → setValue) run before we inspect. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('tryAcquireLock', () => {
  test('acquires lock when none exists and returns owner token', async () => {
    const runtime = createRuntime()
    const token = await tryAcquireLock(runtime, 'v2ex', { newId: () => 'me', verifyDelayMs: 0 })
    expect(token).toBe('me')
    const stored = runtime.stores[LOCK_KEY('v2ex')] as Lock
    expect(stored.owner).toBe('me')
  })

  test('returns null when an active lock is held', async () => {
    const runtime = createRuntime()
    const now = 1_000_000
    runtime.stores[LOCK_KEY('v2ex')] = { owner: 'other', expiresAt: now + 60_000 }
    const token = await tryAcquireLock(runtime, 'v2ex', {
      now: () => now,
      newId: () => 'me',
      verifyDelayMs: 0,
    })
    expect(token).toBeNull()
  })

  test('succeeds when prior lock has expired', async () => {
    const runtime = createRuntime()
    const now = 1_000_000
    runtime.stores[LOCK_KEY('v2ex')] = { owner: 'other', expiresAt: now - 1 }
    const token = await tryAcquireLock(runtime, 'v2ex', {
      now: () => now,
      newId: () => 'me',
      verifyDelayMs: 0,
    })
    expect(token).toBe('me')
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
    const token = await tryAcquireLock(runtime, 'v2ex', { newId: () => 'me', verifyDelayMs: 0 })
    expect(token).toBeNull()
  })

  test('honors custom TTL', async () => {
    const runtime = createRuntime()
    const now = 1_000_000
    await tryAcquireLock(runtime, 'v2ex', {
      ttlMs: 5000,
      now: () => now,
      newId: () => 'me',
      verifyDelayMs: 0,
    })
    const stored = runtime.stores[LOCK_KEY('v2ex')] as Lock
    expect(stored.expiresAt).toBe(now + 5000)
  })

  test('uses global LOCK_TTL_MS of 180s by default', async () => {
    expect(LOCK_TTL_MS).toBe(180_000)
    const runtime = createRuntime()
    const now = 1_000_000
    await tryAcquireLock(runtime, 'v2ex', {
      now: () => now,
      newId: () => 'me',
      verifyDelayMs: 0,
    })
    const stored = runtime.stores[LOCK_KEY('v2ex')] as Lock
    expect(stored.expiresAt).toBe(now + 180_000)
  })

  test('schedules the verify delay on the Runtime, not the global timer (§4.2)', async () => {
    const runtime = createRuntime()
    expect(runtime.activeTimeouts()).toHaveLength(0)
    const p = tryAcquireLock(runtime, 'v2ex', { verifyDelayMs: 50, newId: () => 'me' })
    // The delay is registered two awaits deep (getValue → setValue).
    await flushMicrotasks()
    const pending = runtime.activeTimeouts()
    expect(pending).toHaveLength(1)
    expect(pending[0]!.delay).toBe(50)
    runtime.runTimeout(pending[0]!.id)
    await expect(p).resolves.toBe('me')
  })
})

describe('releaseLock (owner-safe)', () => {
  test('releases lock when token matches owner', async () => {
    const runtime = createRuntime()
    const token = await tryAcquireLock(runtime, 'v2ex', { newId: () => 'me', verifyDelayMs: 0 })
    expect(token).toBe('me')
    await releaseLock(runtime, 'v2ex', token!)
    expect(runtime.stores[LOCK_KEY('v2ex')]).toBeNull()
  })

  test('does not release lock when token does not match current owner', async () => {
    const runtime = createRuntime()
    const now = 1_000_000
    // Tab A acquires lock.
    const tokenA = await tryAcquireLock(runtime, 'v2ex', {
      now: () => now,
      newId: () => 'tab-a',
      verifyDelayMs: 0,
    })
    expect(tokenA).toBe('tab-a')

    // Lock expires, Tab B takes over.
    const later = now + LOCK_TTL_MS + 1
    runtime.stores[LOCK_KEY('v2ex')] = { owner: 'tab-b', expiresAt: later + 60_000 }

    // Tab A tries to release — should NOT clear Tab B's lock.
    await releaseLock(runtime, 'v2ex', tokenA!)
    const stored = runtime.stores[LOCK_KEY('v2ex')] as Lock
    expect(stored.owner).toBe('tab-b')
  })

  test('releases when no lock exists (idempotent)', async () => {
    const runtime = createRuntime()
    await releaseLock(runtime, 'v2ex', 'me')
    expect(runtime.stores[LOCK_KEY('v2ex')]).toBeNull()
  })
})
