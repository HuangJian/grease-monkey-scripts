import type { Runtime } from '../../runtime'
import { numberOrDefault } from '../../utils'
import { loadConfigSection } from '../config'
import type { HupuSourceOptions } from './types'

function coerceHupuOptions(
  raw: Record<string, unknown>,
  fallback: HupuSourceOptions,
): HupuSourceOptions {
  return {
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    boards:
      Array.isArray(raw['boards']) && (raw['boards'] as unknown[]).length > 0
        ? (raw['boards'] as unknown[]).map((s) => String(s)).filter((s) => s.length > 0)
        : fallback.boards,
    retentionDays: numberOrDefault(raw['retentionDays'], fallback.retentionDays),
    todayMinReplies: numberOrDefault(raw['todayMinReplies'], fallback.todayMinReplies),
    olderMinReplies: numberOrDefault(raw['olderMinReplies'], fallback.olderMinReplies),
    ageHalfLifeDays: numberOrDefault(raw['ageHalfLifeDays'], fallback.ageHalfLifeDays),
    lightsWeight: numberOrDefault(raw['lightsWeight'], fallback.lightsWeight),
    repliesWeight: numberOrDefault(raw['repliesWeight'], fallback.repliesWeight),
  }
}

export async function loadFreshHupuOptions(
  runtime: Runtime,
  fallback: HupuSourceOptions,
): Promise<HupuSourceOptions> {
  return loadConfigSection(runtime, 'hupu', fallback, (raw) => coerceHupuOptions(raw, fallback))
}
