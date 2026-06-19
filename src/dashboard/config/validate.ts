import { isPlainObject } from './merge'

const VALID_BADGE_TYPES = ['default', 'none', 'allUnread', 'todayUnread', 'subBoardUpdate']

export type ConfigValidation = { ok: true } | { ok: false; error: string }

type NumberFieldDef = [string, number, number]

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
    const r = validateNumberFields(v, 'v2ex', [
      ['ttlMinutes', 0, Number.POSITIVE_INFINITY],
      ['todayMinReplies', 0, Number.POSITIVE_INFINITY],
      ['olderMinReplies', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
    ])
    if (r) return r
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
      ['todayMinComments', 0, Number.POSITIVE_INFINITY],
      ['olderMinComments', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
    ])
    if (r2) return r2
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
    const r = validateNumberFields(n, 'novels', [
      ['ttlMinutes', 1, Number.POSITIVE_INFINITY],
      ['initialNewChapters', 0, Number.POSITIVE_INFINITY],
      ['maxNewChaptersPerBook', 1, Number.POSITIVE_INFINITY],
      ['maxLatestWindow', 1, Number.POSITIVE_INFINITY],
    ])
    if (r) return r
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
    const numFields: Array<[string, number, number]> = [['ttlMinutes', 1, Number.POSITIVE_INFINITY]]
    for (const [name, min, max] of numFields) {
      if (name in t) {
        const v = t[name]
        if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
          return { ok: false, error: `tnews.${name} 必须是 ${min}–${max} 之间的有限数` }
        }
      }
    }
  }
  if ('xueqiu' in value) {
    const x = value['xueqiu']
    if (!isPlainObject(x)) {
      return { ok: false, error: 'xueqiu 必须是对象' }
    }
    const r = validateNumberFields(x, 'xueqiu', [['ttlMinutes', 1, Number.POSITIVE_INFINITY]])
    if (r) return r
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
      ['todayMinReplies', 0, Number.POSITIVE_INFINITY],
      ['olderMinReplies', 0, Number.POSITIVE_INFINITY],
      ['ageHalfLifeDays', 0.1, 30],
      ['lightsWeight', 0, 100],
      ['repliesWeight', 0, 100],
    ])
    if (r) return r
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
      if ('badgeType' in v && !VALID_BADGE_TYPES.includes(v['badgeType'] as string)) {
        return {
          ok: false,
          error: `sourceSettings.${key}.badgeType 必须是 ${VALID_BADGE_TYPES.join('/')}`,
        }
      }
    }
  }
  return { ok: true }
}
