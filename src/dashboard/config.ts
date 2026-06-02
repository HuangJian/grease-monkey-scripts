import type { Runtime } from '../runtime'
import { CONFIG_KEY, type Config } from './types'

export const DEFAULT_CONFIG: Config = {
  weather: {
    latitude: 39.9042,
    longitude: 116.4074,
    cityLabel: '北京',
    ttlMinutes: 60,
  },
  v2ex: {
    ttlMinutes: 30,
    maxItems: 10,
  },
  shortcut: {
    doublePressWindowMs: 400,
    enabled: true,
  },
  hostAllowlist: ['mail.google.com', 'v2ex.com', 'github.com'],
} as const

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  if (Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : (override as T)
  }
  const result: Record<string, unknown> = { ...base }
  for (const key of Object.keys(override)) {
    const baseVal = base[key as keyof T]
    const overrideVal = override[key]
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(baseVal, overrideVal)
    } else if (overrideVal !== undefined) {
      result[key] = overrideVal
    }
  }
  return result as T
}

export async function loadConfig(runtime: Runtime): Promise<Config> {
  const userOverride = await runtime.getValue<unknown>(CONFIG_KEY, null)
  if (!userOverride) return DEFAULT_CONFIG
  return deepMerge(DEFAULT_CONFIG, userOverride)
}

export function defaultConfigExample(): string {
  return JSON.stringify({ weather: { cityLabel: '上海', ttlMinutes: 30 } }, null, 2)
}

export type ConfigValidation = { ok: true } | { ok: false; error: string }

export function validateConfig(value: unknown): ConfigValidation {
  if (!isPlainObject(value)) {
    return { ok: false, error: '根值必须是 plain object' }
  }
  if ('shortcut' in value) {
    const s = value['shortcut']
    if (!isPlainObject(s)) {
      return { ok: false, error: 'shortcut 必须是对象' }
    }
    if ('doublePressWindowMs' in s && typeof s['doublePressWindowMs'] !== 'number') {
      return { ok: false, error: 'shortcut.doublePressWindowMs 必须是 number' }
    }
    if ('enabled' in s && typeof s['enabled'] !== 'boolean') {
      return { ok: false, error: 'shortcut.enabled 必须是 boolean' }
    }
  }
  if ('hostAllowlist' in value) {
    const list = value['hostAllowlist']
    if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) {
      return { ok: false, error: 'hostAllowlist 必须是 string[]' }
    }
  }
  if ('weather' in value) {
    const w = value['weather']
    if (!isPlainObject(w)) {
      return { ok: false, error: 'weather 必须是对象' }
    }
  }
  if ('v2ex' in value) {
    const v = value['v2ex']
    if (!isPlainObject(v)) {
      return { ok: false, error: 'v2ex 必须是对象' }
    }
  }
  return { ok: true }
}
