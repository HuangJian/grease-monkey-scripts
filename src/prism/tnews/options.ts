import type { Runtime } from '../../runtime'
import { numberOrDefault } from '../../utils'
import { loadConfigSection } from '../config'
import type { TnewsSourceOptions } from './types'

function coerceTnewsOptions(
  raw: Record<string, unknown>,
  fallback: TnewsSourceOptions,
): TnewsSourceOptions {
  return {
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
  }
}

export async function loadFreshTnewsOptions(
  runtime: Runtime,
  fallback: TnewsSourceOptions,
): Promise<TnewsSourceOptions> {
  return loadConfigSection(runtime, 'tnews', fallback, (raw) => coerceTnewsOptions(raw, fallback))
}
