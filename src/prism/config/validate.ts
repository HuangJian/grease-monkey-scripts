import { isPlainObject } from './merge'
import { VALID_BADGE_TYPES } from '../types'
import type { Config, SourceSettings } from '../types'

export type ConfigValidation = { ok: true } | { ok: false; error: string }

type NumberFieldDef = [string, number, number]

/** Returns an error when `obj` contains keys not in `fields`. */
function rejectUnknownKeys(
  obj: Record<string, unknown>,
  prefix: string,
  fields: readonly string[],
): ConfigValidation | null {
  const unknown = Object.keys(obj).find((k) => !fields.includes(k))
  if (unknown !== undefined) {
    return { ok: false, error: `${prefix} 包含未知字段 "${unknown}"` }
  }
  return null
}

function validateNumberFields(
  obj: Record<string, unknown>,
  prefix: string,
  fields: NumberFieldDef[],
): ConfigValidation | null {
  for (const [name, min, max] of fields) {
    if (name in obj) {
      const n = obj[name]
      const displayMax = Number.isFinite(max) ? String(max) : '∞'
      if (
        typeof n !== 'number' ||
        n < min ||
        (Number.isFinite(max) ? n > max : !Number.isFinite(n) && n > max)
      ) {
        return { ok: false, error: `${prefix}.${name} 必须是 ${min}–${displayMax} 之间的数` }
      }
    }
  }
  return null
}

export function validateConfig(value: unknown): ConfigValidation {
  if (!isPlainObject(value)) {
    return { ok: false, error: '根值必须是 plain object' }
  }
  const ROOT_FIELDS = [
    'weather',
    'v2ex',
    'reddit',
    'hupu',
    'novels',
    'tnews',
    'xueqiu',
    'misc',
    'xit',
    'shortcut',
    'hostAllowlist',
    'sourceSettings',
  ] as const satisfies readonly (keyof Config)[]
  const rootUnknown = Object.keys(value).find(
    (k) => !ROOT_FIELDS.includes(k as (typeof ROOT_FIELDS)[number]),
  )
  if (rootUnknown !== undefined) {
    return { ok: false, error: `配置包含未知字段 "${rootUnknown}"` }
  }
  if ('hostAllowlist' in value) {
    const list = value['hostAllowlist']
    if (!Array.isArray(list) || !list.every((x) => typeof x === 'string')) {
      return { ok: false, error: 'hostAllowlist 必须是 string[]' }
    }
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
    const SHORTCUT_FIELDS = [
      'doublePressWindowMs',
      'enabled',
    ] as const satisfies readonly (keyof Config['shortcut'])[]
    const shortcutUnknown = rejectUnknownKeys(s, 'shortcut', SHORTCUT_FIELDS)
    if (shortcutUnknown) return shortcutUnknown
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
        if ('cmaStationId' in c && typeof c['cmaStationId'] !== 'string') {
          return { ok: false, error: `weather.cities[${i}].cmaStationId 必须是 string` }
        }
      }
    }
    if ('ttlMinutes' in w) {
      const n = w['ttlMinutes']
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
        return { ok: false, error: 'weather.ttlMinutes 必须是正数' }
      }
    }
    const WEATHER_FIELDS = [
      'cities',
      'ttlMinutes',
    ] as const satisfies readonly (keyof Config['weather'])[]
    const weatherUnknown = rejectUnknownKeys(w, 'weather', WEATHER_FIELDS)
    if (weatherUnknown) return weatherUnknown
  }
  if ('v2ex' in value) {
    const v = value['v2ex']
    if (!isPlainObject(v)) {
      return { ok: false, error: 'v2ex 必须是对象' }
    }
    const r = validateNumberFields(v, 'v2ex', [
      ['ttlMinutes', 0, Number.POSITIVE_INFINITY],
      ['retentionDays', 1, 90],
      ['todayMinReplies', 0, Number.POSITIVE_INFINITY],
      ['olderMinReplies', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
    ])
    if (r) return r
    const V2EX_FIELDS = [
      'ttlMinutes',
      'retentionDays',
      'todayMinReplies',
      'olderMinReplies',
      'ageHalfLifeDays',
    ] as const satisfies readonly (keyof Config['v2ex'])[]
    const v2exUnknown = rejectUnknownKeys(v, 'v2ex', V2EX_FIELDS)
    if (v2exUnknown) return v2exUnknown
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
    const r2 = validateNumberFields(r, 'reddit', [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['retentionDays', 1, 90],
      ['todayMinComments', 0, Number.POSITIVE_INFINITY],
      ['olderMinComments', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
    ])
    if (r2) return r2
    const REDDIT_FIELDS = [
      'ttlMinutes',
      'retentionDays',
      'todayMinComments',
      'olderMinComments',
      'ageHalfLifeDays',
      'subreddits',
    ] as const satisfies readonly (keyof Config['reddit'])[]
    const redditUnknown = rejectUnknownKeys(r, 'reddit', REDDIT_FIELDS)
    if (redditUnknown) return redditUnknown
  }
  if ('novels' in value) {
    const n = value['novels']
    if (!isPlainObject(n)) {
      return { ok: false, error: 'novels 必须是对象' }
    }
    if ('books' in n) {
      const list = n['books']
      if (!Array.isArray(list)) {
        return { ok: false, error: 'novels.books 必须是数组' }
      }
      const seenUrls = new Set<string>()
      for (let i = 0; i < list.length; i++) {
        const b = list[i]
        if (!isPlainObject(b)) {
          return { ok: false, error: `novels.books[${i}] 必须是对象` }
        }
        if (typeof b['title'] !== 'string') {
          return { ok: false, error: `novels.books[${i}].title 必须是 string` }
        }
        const urls = b['urls']
        if (!Array.isArray(urls) || urls.length === 0) {
          return { ok: false, error: `novels.books[${i}].urls 必须是非空数组` }
        }
        for (let j = 0; j < urls.length; j++) {
          const u = urls[j]
          if (typeof u !== 'string' || !u) {
            return { ok: false, error: `novels.books[${i}].urls[${j}] 必须是非空字符串` }
          }
          try {
            void new URL(u)
          } catch {
            return { ok: false, error: `novels.books[${i}].urls[${j}] 必须是有效 URL` }
          }
          if (seenUrls.has(u)) {
            return { ok: false, error: `novels 的 URL 重复：${u}` }
          }
          seenUrls.add(u)
        }
      }
    } else if ('entries' in n) {
      // Legacy single-source shape kept for backward compatibility.
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
    const r = validateNumberFields(n, 'novels', [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['initialNewChapters', 0, Number.POSITIVE_INFINITY],
      ['maxNewChaptersPerBook', 1, Number.POSITIVE_INFINITY],
      ['maxLatestWindow', 1, Number.POSITIVE_INFINITY],
    ])
    if (r) return r
    const NOVELS_FIELDS = [
      'books',
      'ttlMinutes',
      'initialNewChapters',
      'maxNewChaptersPerBook',
      'maxLatestWindow',
    ] as const satisfies readonly (keyof Config['novels'])[]
    // 'entries' is the legacy single-source shape kept for backward compat.
    const novelsUnknown = rejectUnknownKeys(n, 'novels', [...NOVELS_FIELDS, 'entries'])
    if (novelsUnknown) return novelsUnknown
  }
  if ('tnews' in value) {
    const t = value['tnews']
    if (!isPlainObject(t)) {
      return { ok: false, error: 'tnews 必须是对象' }
    }
    const numFields: Array<[string, number, number]> = [['ttlMinutes', 1, Number.POSITIVE_INFINITY]]
    for (const [name, min, max] of numFields) {
      if (name in t) {
        const v = t[name]
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
          return { ok: false, error: `tnews.${name} 必须是 ${min}–${max} 之间的有限数` }
        }
      }
    }
    const TNEWS_FIELDS = ['ttlMinutes'] as const satisfies readonly (keyof Config['tnews'])[]
    const tnewsUnknown = rejectUnknownKeys(t, 'tnews', TNEWS_FIELDS)
    if (tnewsUnknown) return tnewsUnknown
  }
  if ('xueqiu' in value) {
    const x = value['xueqiu']
    if (!isPlainObject(x)) {
      return { ok: false, error: 'xueqiu 必须是对象' }
    }
    const r = validateNumberFields(x, 'xueqiu', [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['retentionDays', 1, 90],
    ])
    if (r) return r
    const XUEQIU_FIELDS = [
      'ttlMinutes',
      'retentionDays',
    ] as const satisfies readonly (keyof Config['xueqiu'])[]
    const xueqiuUnknown = rejectUnknownKeys(x, 'xueqiu', XUEQIU_FIELDS)
    if (xueqiuUnknown) return xueqiuUnknown
  }
  if ('xit' in value) {
    const n = value['xit']
    if (!isPlainObject(n)) {
      return { ok: false, error: 'xit 必须是对象' }
    }
    if ('enabled' in n && typeof n['enabled'] !== 'boolean') {
      return { ok: false, error: 'xit.enabled 必须是 boolean' }
    }
    if ('placement' in n && n['placement'] !== 'main' && n['placement'] !== 'side') {
      return { ok: false, error: 'xit.placement 必须是 "main" 或 "side"' }
    }
    const XIT_FIELDS = ['enabled', 'placement'] as const satisfies readonly (keyof Config['xit'])[]
    const xitUnknown = rejectUnknownKeys(n, 'xit', XIT_FIELDS)
    if (xitUnknown) return xitUnknown
  }
  if ('misc' in value) {
    const m = value['misc']
    if (!isPlainObject(m)) {
      return { ok: false, error: 'misc 必须是对象' }
    }
    const r = validateNumberFields(m, 'misc', [['ttlMinutes', 1, Number.POSITIVE_INFINITY]])
    if (r) return r
    const MISC_FIELDS = ['ttlMinutes'] as const satisfies readonly (keyof NonNullable<
      Config['misc']
    >)[]
    const miscUnknown = rejectUnknownKeys(m, 'misc', MISC_FIELDS)
    if (miscUnknown) return miscUnknown
  }
  if ('hupu' in value) {
    const h = value['hupu']
    if (!isPlainObject(h)) {
      return { ok: false, error: 'hupu 必须是对象' }
    }
    if ('boards' in h) {
      const list = h['boards']
      if (!Array.isArray(list) || list.length === 0) {
        return { ok: false, error: 'hupu.boards 必须是非空数组' }
      }
      for (let i = 0; i < list.length; i++) {
        const s = list[i]
        if (typeof s !== 'string' || !s.trim()) {
          return { ok: false, error: `hupu.boards[${i}] 必须是非空字符串` }
        }
      }
    }
    const r = validateNumberFields(h, 'hupu', [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['retentionDays', 1, 90],
      ['todayMinReplies', 0, Number.POSITIVE_INFINITY],
      ['olderMinReplies', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
      ['lightsWeight', 0, 100],
      ['repliesWeight', 0, 100],
    ])
    if (r) return r
    const HUPU_FIELDS = [
      'ttlMinutes',
      'retentionDays',
      'boards',
      'todayMinReplies',
      'olderMinReplies',
      'ageHalfLifeDays',
      'lightsWeight',
      'repliesWeight',
    ] as const satisfies readonly (keyof Config['hupu'])[]
    const hupuUnknown = rejectUnknownKeys(h, 'hupu', HUPU_FIELDS)
    if (hupuUnknown) return hupuUnknown
  }
  if ('sourceSettings' in value) {
    const s = value['sourceSettings']
    if (!isPlainObject(s)) {
      return { ok: false, error: 'sourceSettings 必须是对象' }
    }
    for (const [key, v] of Object.entries(s)) {
      if (!isPlainObject(v)) {
        return { ok: false, error: `sourceSettings.${key} 必须是对象` }
      }
      if ('tabTitle' in v && typeof v['tabTitle'] !== 'string') {
        return { ok: false, error: `sourceSettings.${key}.tabTitle 必须是 string` }
      }
      if ('priority' in v && typeof v['priority'] !== 'number') {
        return { ok: false, error: `sourceSettings.${key}.priority 必须是 number` }
      }
      if (
        'badgeType' in v &&
        !VALID_BADGE_TYPES.includes(v['badgeType'] as (typeof VALID_BADGE_TYPES)[number])
      ) {
        return {
          ok: false,
          error: `sourceSettings.${key}.badgeType 必须是 ${VALID_BADGE_TYPES.join('/')}`,
        }
      }
      const SOURCE_SETTINGS_FIELDS = [
        'tabTitle',
        'priority',
        'badgeType',
      ] as const satisfies readonly (keyof SourceSettings)[]
      const ssUnknown = rejectUnknownKeys(v, `sourceSettings.${key}`, SOURCE_SETTINGS_FIELDS)
      if (ssUnknown) return ssUnknown
    }
  }
  return { ok: true }
}
