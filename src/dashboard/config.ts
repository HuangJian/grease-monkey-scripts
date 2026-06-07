import type { Runtime } from '../runtime'
import { CONFIG_KEY, type Config } from './types'

export const DEFAULT_CONFIG: Config = {
  weather: {
    cities: [{ latitude: 39.9042, longitude: 116.4074, cityLabel: '北京' }],
    ttlMinutes: 60,
  },
  v2ex: {
    ttlMinutes: 30,
    minItems: 10,
    maxItems: 30,
    displayRatio: 0.1,
    elbowDropRatio: 0.4,
    minReplies: 5,
    ageHalfLifeDays: 2,
  },
  reddit: {
    ttlMinutes: 30,
    ageHalfLifeDays: 2,
    subreddits: ['popular'],
    minItems: 10,
    maxItems: 30,
    minPerSub: 1,
    displayRatio: 0.1,
    elbowDropRatio: 0.4,
    minCutoffScore: 500,
  },
  novels: {
    entries: [],
    ttlMinutes: 60,
    initialNewChapters: 3,
    maxNewChaptersPerBook: 5,
    maxLatestWindow: 50,
  },
  tnews: {
    feeds: ['https://rsshub.app/telegram/channel/tnews365'],
    mirrors: ['rsshub.rssforever.com'],
    ttlMinutes: 30,
    maxItems: 30,
  },
  shortcut: {
    doublePressWindowMs: 400,
    enabled: true,
  },
  hostAllowlist: ['mail.google.com', 'v2ex.com', 'github.com', 'www.sudugu.org'],
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
  } catch {}
  return fallback
}

export function defaultConfigExample(): string {
  return JSON.stringify(
    {
      weather: {
        ttlMinutes: 30,
        cities: [
          { latitude: 39.9042, longitude: 116.4074, cityLabel: '北京' },
          { latitude: 31.2304, longitude: 121.4737, cityLabel: '上海' },
        ],
      },
    },
    null,
    2,
  )
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
    if ('latitude' in w || 'longitude' in w || 'cityLabel' in w) {
      return {
        ok: false,
        error:
          'weather 不再支持 latitude/longitude/cityLabel,请改为 cities: [{ latitude, longitude, cityLabel }]',
      }
    }
    if ('cities' in w) {
      const cities = w['cities']
      if (!Array.isArray(cities) || cities.length === 0) {
        return { ok: false, error: 'weather.cities 必须是非空数组' }
      }
      for (let i = 0; i < cities.length; i++) {
        const c = cities[i]
        if (!isPlainObject(c)) {
          return { ok: false, error: `weather.cities[${i}] 必须是对象` }
        }
        if (typeof c['latitude'] !== 'number' || !Number.isFinite(c['latitude'])) {
          return { ok: false, error: `weather.cities[${i}].latitude 必须是有限数` }
        }
        if (typeof c['longitude'] !== 'number' || !Number.isFinite(c['longitude'])) {
          return { ok: false, error: `weather.cities[${i}].longitude 必须是有限数` }
        }
        if (typeof c['cityLabel'] !== 'string' || !c['cityLabel']) {
          return { ok: false, error: `weather.cities[${i}].cityLabel 必须是非空字符串` }
        }
      }
    }
    if ('ttlMinutes' in w) {
      const n = w['ttlMinutes']
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
        return { ok: false, error: 'weather.ttlMinutes 必须是正数' }
      }
    }
  }
  if ('v2ex' in value) {
    const v = value['v2ex']
    if (!isPlainObject(v)) {
      return { ok: false, error: 'v2ex 必须是对象' }
    }
    const numFields: Array<[string, number, number]> = [
      ['ttlMinutes', 0, Number.POSITIVE_INFINITY],
      ['minItems', 0, Number.POSITIVE_INFINITY],
      ['maxItems', 0, Number.POSITIVE_INFINITY],
      ['minReplies', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
    ]
    for (const [name, min, max] of numFields) {
      if (name in v) {
        const n = v[name]
        if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
          return { ok: false, error: `v2ex.${name} 必须是 ${min}–${max} 之间的有限数` }
        }
      }
    }
    for (const name of ['displayRatio', 'elbowDropRatio']) {
      if (name in v) {
        const n = v[name]
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) {
          return { ok: false, error: `v2ex.${name} 必须是 0–1 之间的有限数` }
        }
      }
    }
    if ('minItems' in v && 'maxItems' in v) {
      const minI = v['minItems']
      const maxI = v['maxItems']
      if (typeof minI === 'number' && typeof maxI === 'number' && minI > maxI) {
        return { ok: false, error: 'v2ex.minItems 不能大于 v2ex.maxItems' }
      }
    }
  }
  if ('reddit' in value) {
    const r = value['reddit']
    if (!isPlainObject(r)) {
      return { ok: false, error: 'reddit 必须是对象' }
    }
    if ('subreddits' in r) {
      const list = r['subreddits']
      if (!Array.isArray(list) || list.length === 0) {
        return { ok: false, error: 'reddit.subreddits 必须是非空数组' }
      }
      for (let i = 0; i < list.length; i++) {
        const s = list[i]
        if (typeof s !== 'string' || !s.trim()) {
          return { ok: false, error: `reddit.subreddits[${i}] 必须是非空字符串` }
        }
      }
    }
    const numFields: Array<[string, number, number]> = [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['minItems', 1, Number.POSITIVE_INFINITY],
      ['maxItems', 1, Number.POSITIVE_INFINITY],
      ['minPerSub', 0, Number.POSITIVE_INFINITY],
      ['minCutoffScore', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
    ]
    for (const [name, min, max] of numFields) {
      if (name in r) {
        const n = r[name]
        if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) {
          return { ok: false, error: `reddit.${name} 必须是 ${min}–${max} 之间的有限数` }
        }
      }
    }
    for (const name of ['displayRatio', 'elbowDropRatio']) {
      if (name in r) {
        const n = r[name]
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1) {
          return { ok: false, error: `reddit.${name} 必须是 0–1 之间的有限数` }
        }
      }
    }
    if ('minItems' in r && 'maxItems' in r) {
      const minI = r['minItems']
      const maxI = r['maxItems']
      if (typeof minI === 'number' && typeof maxI === 'number' && minI > maxI) {
        return { ok: false, error: 'reddit.minItems 不能大于 reddit.maxItems' }
      }
    }
  }
  if ('novels' in value) {
    const n = value['novels']
    if (!isPlainObject(n)) {
      return { ok: false, error: 'novels 必须是对象' }
    }
    if ('entries' in n) {
      const list = n['entries']
      if (!Array.isArray(list)) {
        return { ok: false, error: 'novels.entries 必须是数组' }
      }
      for (let i = 0; i < list.length; i++) {
        const e = list[i]
        if (!isPlainObject(e)) {
          return { ok: false, error: `novels.entries[${i}] 必须是对象` }
        }
        if (typeof e['url'] !== 'string' || !e['url']) {
          return { ok: false, error: `novels.entries[${i}].url 必须是非空字符串` }
        }
        try {
          void new URL(e['url'])
        } catch {
          return { ok: false, error: `novels.entries[${i}].url 必须是有效 URL` }
        }
        if ('alias' in e && e['alias'] != null && typeof e['alias'] !== 'string') {
          return { ok: false, error: `novels.entries[${i}].alias 必须是 string 或省略` }
        }
      }
    }
    const numFields: Array<[string, number, number]> = [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['initialNewChapters', 0, Number.POSITIVE_INFINITY],
      ['maxNewChaptersPerBook', 1, Number.POSITIVE_INFINITY],
      ['maxLatestWindow', 1, Number.POSITIVE_INFINITY],
    ]
    for (const [name, min, max] of numFields) {
      if (name in n) {
        const v = n[name]
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
          return { ok: false, error: `novels.${name} 必须是 ${min}–${max} 之间的有限数` }
        }
      }
    }
  }
  if ('tnews' in value) {
    const t = value['tnews']
    if (!isPlainObject(t)) {
      return { ok: false, error: 'tnews 必须是对象' }
    }
    if ('feeds' in t) {
      const list = t['feeds']
      if (!Array.isArray(list) || list.length === 0) {
        return { ok: false, error: 'tnews.feeds 必须是非空数组' }
      }
      for (let i = 0; i < list.length; i++) {
        const u = list[i]
        if (typeof u !== 'string' || !u.trim()) {
          return { ok: false, error: `tnews.feeds[${i}] 必须是非空字符串` }
        }
        try {
          void new URL(u)
        } catch {
          return { ok: false, error: `tnews.feeds[${i}] 必须是有效 URL` }
        }
      }
    }
    if ('mirrors' in t) {
      const list = t['mirrors']
      if (!Array.isArray(list)) {
        return { ok: false, error: 'tnews.mirrors 必须是数组' }
      }
      for (let i = 0; i < list.length; i++) {
        const m = list[i]
        if (typeof m !== 'string' || !/^[a-z0-9.-]+$/i.test(m)) {
          return { ok: false, error: `tnews.mirrors[${i}] 必须是合法 hostname` }
        }
      }
    }
    const numFields: Array<[string, number, number]> = [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['maxItems', 1, Number.POSITIVE_INFINITY],
    ]
    for (const [name, min, max] of numFields) {
      if (name in t) {
        const v = t[name]
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
          return { ok: false, error: `tnews.${name} 必须是 ${min}–${max} 之间的有限数` }
        }
      }
    }
  }
  return { ok: true }
}
