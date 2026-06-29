import type { Runtime } from '../../runtime'
import { CONFIG_KEY } from '../types'
import { DEFAULT_CONFIG } from './defaults'
import { deepMerge, isPlainObject } from './merge'

export async function loadConfig(runtime: Runtime): Promise<typeof DEFAULT_CONFIG> {
  const userOverride = await runtime.getValue<unknown>(CONFIG_KEY, null)
  if (!userOverride) return DEFAULT_CONFIG
  return deepMerge(DEFAULT_CONFIG, userOverride)
}

export async function loadConfigSection<T>(
  runtime: Runtime,
  sectionKey: string,
  fallback: T,
  coerce: (raw: Record<string, unknown>) => T,
): Promise<T> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const section = stored?.[sectionKey]
    if (isPlainObject(section)) {
      return coerce(section as Record<string, unknown>)
    }
  } catch (e) {
    console.debug('[gm-dashboard] loadConfigSection error', e)
  }
  return fallback
}
