import type { Runtime } from '../../runtime'
import type { Config } from '../types'
import { CONFIG_KEY } from '../types'
import { DEFAULT_CONFIG } from './defaults'
import { deepMerge, isPlainObject } from './merge'
import { validateConfig } from './validate'

export async function loadConfig(runtime: Runtime): Promise<Config> {
  const userOverride = await runtime.getValue<unknown>(CONFIG_KEY, null)
  if (!userOverride) return DEFAULT_CONFIG
  const merged = deepMerge(DEFAULT_CONFIG, userOverride)
  const validation = validateConfig(merged)
  if (!validation.ok) {
    console.warn(`[gm-dashboard] 配置无效:${validation.error}，已回落到默认配置`)
    return DEFAULT_CONFIG
  }
  return merged
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
