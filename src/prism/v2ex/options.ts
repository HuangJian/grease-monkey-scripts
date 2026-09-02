import type { Runtime } from '../../runtime'
import { numberOrDefault } from '../../utils'
import { loadConfigSection } from '../config'
import type { V2exSourceOptions } from './types'

function coerceV2exOptions(
  raw: Record<string, unknown>,
  fallback: V2exSourceOptions,
): V2exSourceOptions {
  return {
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    retentionDays: numberOrDefault(raw['retentionDays'], fallback.retentionDays),
    todayMinReplies: numberOrDefault(raw['todayMinReplies'], fallback.todayMinReplies),
    olderMinReplies: numberOrDefault(raw['olderMinReplies'], fallback.olderMinReplies),
    ageHalfLifeDays: numberOrDefault(raw['ageHalfLifeDays'], fallback.ageHalfLifeDays),
  }
}

export async function loadFreshV2exOptions(
  runtime: Runtime,
  fallback: V2exSourceOptions,
): Promise<V2exSourceOptions> {
  return loadConfigSection(runtime, 'v2ex', fallback, (raw) => coerceV2exOptions(raw, fallback))
}
