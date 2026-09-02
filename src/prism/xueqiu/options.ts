import type { Runtime } from '../../runtime'
import { numberOrDefault } from '../../utils'
import { loadConfigSection } from '../config'
import type { XueqiuSourceOptions } from './types'

function coerceXueqiuOptions(
  raw: Record<string, unknown>,
  fallback: XueqiuSourceOptions,
): XueqiuSourceOptions {
  return {
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    retentionDays: numberOrDefault(raw['retentionDays'], fallback.retentionDays),
  }
}

export async function loadFreshXueqiuOptions(
  runtime: Runtime,
  fallback: XueqiuSourceOptions,
): Promise<XueqiuSourceOptions> {
  return loadConfigSection(runtime, 'xueqiu', fallback, (raw) => coerceXueqiuOptions(raw, fallback))
}
