/**
 * Shared scoring utilities for time decay calculations.
 *
 * Used by v2ex, hupu, reddit, and xueqiu modules.
 */

/** Returns the start of today (UTC midnight) in milliseconds. */
export function getTodayStartMs(now?: Date): number {
  const d = now ?? new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

/**
 * Compute exponential time decay factor.
 *
 * Formula: exp(-days * ln(2) / halfLifeDays)
 * Where days = (nowMs - createdMs) / 86_400_000
 *
 * @param createdMs - Creation timestamp in ms
 * @param nowMs - Current timestamp in ms
 * @param halfLifeDays - Half-life in days
 * @returns Decay factor between 0 and 1
 */
export function computeTimeDecay(createdMs: number, nowMs: number, halfLifeDays: number): number {
  const days = Math.max(0, (nowMs - createdMs) / 86_400_000)
  const lambda = Math.log(2) / halfLifeDays
  return Math.exp(-days * lambda)
}

/**
 * Compute decayed score: value * timeDecay.
 *
 * Returns 0 if value <= 0 or is not finite.
 *
 * @param value - Base score value (e.g., replies, lights)
 * @param createdMs - Creation timestamp in ms
 * @param nowMs - Current timestamp in ms
 * @param halfLifeDays - Half-life in days
 * @returns Decayed score
 */
export function computeDecayedScore(
  value: number,
  createdMs: number,
  nowMs: number,
  halfLifeDays: number,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value * computeTimeDecay(createdMs, nowMs, halfLifeDays)
}
