import type { Runtime } from '../../runtime'
import type { Config } from '../config/types'
import { CONFIG_KEY, DEFAULT_SOURCE_SETTINGS } from '../types'
import { DEFAULT_CONFIG } from './defaults'
import { deepMerge, isPlainObject } from './merge'
import { validateConfig } from './validate'

/**
 * Retired fields still accepted by validation for backward compatibility.
 * They must survive `stripUnknownFields` or old configs would silently lose them.
 */
const LEGACY_SECTION_FIELDS: Record<string, readonly string[]> = {
  novels: ['entries'],
}

const SOURCE_SETTINGS_FIELDS = Object.keys(DEFAULT_SOURCE_SETTINGS)

/** Field whitelist for a section, derived from the shipped defaults. */
function sectionFields(section: string): readonly string[] | null {
  const base = (DEFAULT_CONFIG as Record<string, unknown>)[section]
  if (!isPlainObject(base)) return null
  return [...Object.keys(base), ...(LEGACY_SECTION_FIELDS[section] ?? [])]
}

type Stripped = { value: Record<string, unknown>; dropped: string[] }

function stripUnknown(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  prefix: string,
): Stripped {
  const value: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const [key, v] of Object.entries(obj)) {
    if (allowed.includes(key)) value[key] = v
    else dropped.push(prefix ? `${prefix}.${key}` : key)
  }
  return { value, dropped }
}

/**
 * Drop fields this version no longer knows about (retired or never existed).
 * Without this, one stale field makes `validateConfig` reject the whole config
 * and every user setting is discarded — including unrelated sections.
 */
function stripUnknownFields(config: Record<string, unknown>): Stripped {
  const root = stripUnknown(config, Object.keys(DEFAULT_CONFIG), '')
  const { value } = root
  const dropped = [...root.dropped]
  for (const key of Object.keys(value)) {
    const section = value[key]
    if (!isPlainObject(section)) continue
    if (key === 'sourceSettings') {
      const entries: Record<string, unknown> = {}
      for (const [id, entry] of Object.entries(section)) {
        if (!isPlainObject(entry)) {
          entries[id] = entry
          continue
        }
        const r = stripUnknown(entry, SOURCE_SETTINGS_FIELDS, `sourceSettings.${id}`)
        dropped.push(...r.dropped)
        entries[id] = r.value
      }
      value[key] = entries
      continue
    }
    const allowed = sectionFields(key)
    if (!allowed) continue
    const r = stripUnknown(section, allowed, key)
    dropped.push(...r.dropped)
    value[key] = r.value
  }
  return { value, dropped }
}

/** Reset only the invalid sections to their defaults, keeping the valid ones. */
function resetInvalidSections(config: Record<string, unknown>): string[] {
  const reset: string[] = []
  for (const key of Object.keys(config)) {
    if (validateConfig({ [key]: config[key] }).ok) continue
    reset.push(key)
    config[key] = (DEFAULT_CONFIG as Record<string, unknown>)[key]
  }
  return reset
}

export async function loadConfig(runtime: Runtime): Promise<Config> {
  const userOverride = await runtime.getValue<unknown>(CONFIG_KEY, null)
  if (!userOverride) return DEFAULT_CONFIG
  const merged = deepMerge(DEFAULT_CONFIG, userOverride)
  // A non-object override (corrupt storage) replaces the defaults wholesale;
  // there is nothing to repair, so fall back.
  if (!isPlainObject(merged)) return DEFAULT_CONFIG
  const stripped = stripUnknownFields(merged)
  if (stripped.dropped.length > 0) {
    console.warn(`[gm-dashboard] 忽略配置中的未知字段:${stripped.dropped.join('、')}`)
  }
  const validation = validateConfig(stripped.value)
  if (validation.ok) return stripped.value as Config
  console.warn(`[gm-dashboard] 配置无效:${validation.error}，仅回落无效的配置段`)
  const reset = resetInvalidSections(stripped.value)
  if (reset.length > 0) {
    console.warn(`[gm-dashboard] 已回落到默认的配置段:${reset.join('、')}`)
  }
  if (validateConfig(stripped.value).ok) return stripped.value as Config
  console.warn('[gm-dashboard] 配置仍无效，已回落到默认配置')
  return DEFAULT_CONFIG
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
