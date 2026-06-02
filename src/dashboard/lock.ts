// The 50ms setTimeout below is intentional, not a bug. Tampermonkey has no
// CAS primitive for GM.setValue, so after writing {owner:me, ...} we sleep
// briefly and re-read: if another tab beat us to it their value will be
// there. Worst case both tabs see their own owner (genuine double-fetch)
// and waste one HTTP request; correctness is unaffected. Do not "fix" this
// by removing the delay or adding MutationObserver on stores — the simpler
// shape is the right one for this script.
import type { Runtime } from '../runtime'
import { LOCK_KEY, LOCK_TTL_MS, LOCK_VERIFY_DELAY_MS, type Lock } from './types'

export type AcquireLockOptions = {
  ttlMs?: number
  verifyDelayMs?: number
  now?: () => number
  newId?: () => string
}

export async function tryAcquireLock(
  runtime: Runtime,
  sourceId: string,
  options: AcquireLockOptions = {},
): Promise<boolean> {
  const ttlMs = options.ttlMs ?? LOCK_TTL_MS
  const verifyDelayMs = options.verifyDelayMs ?? LOCK_VERIFY_DELAY_MS
  const now = options.now ?? Date.now
  const newId = options.newId ?? (() => crypto.randomUUID())

  const key = LOCK_KEY(sourceId)
  const ts = now()
  const existing = await runtime.getValue<Lock | null>(key, null)
  if (existing && existing.expiresAt > ts) return false

  const me: Lock = { owner: newId(), expiresAt: ts + ttlMs }
  await runtime.setValue(key, me)
  if (verifyDelayMs > 0) {
    await new Promise<void>((r) => setTimeout(r, verifyDelayMs))
  }
  const after = await runtime.getValue<Lock>(key, me)
  return after.owner === me.owner
}
