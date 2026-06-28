import { describe, expect, test } from 'bun:test'
import { validateConfig } from '../../src/dashboard/config/validate'
import { DEFAULT_CONFIG } from '../../src/dashboard/config/defaults'

describe('validateConfig', () => {
  describe('root validation', () => {
    test('accepts empty object', () => {
      expect(validateConfig({})).toEqual({ ok: true })
    })

    test('rejects non-object', () => {
      expect(validateConfig('string')).toEqual({ ok: false, error: '根值必须是 plain object' })
      expect(validateConfig(42)).toEqual({ ok: false, error: '根值必须是 plain object' })
      expect(validateConfig(null)).toEqual({ ok: false, error: '根值必须是 plain object' })
    })

    test('rejects array', () => {
      expect(validateConfig([])).toEqual({ ok: false, error: '根值必须是 plain object' })
    })

    test('accepts full default config', () => {
      expect(validateConfig(DEFAULT_CONFIG)).toEqual({ ok: true })
    })
  })

  describe('hostAllowlist', () => {
    test('accepts valid hostAllowlist', () => {
      const result = validateConfig({ hostAllowlist: ['example.com', 'test.org'] })
      expect(result).toEqual({ ok: true })
    })

    test('rejects non-array hostAllowlist', () => {
      const result = validateConfig({ hostAllowlist: 'example.com' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('hostAllowlist 必须是 string[]')
    })

    test('rejects array with non-string elements', () => {
      const result = validateConfig({ hostAllowlist: ['example.com', 42] })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('hostAllowlist 必须是 string[]')
    })
  })

  describe('shortcut', () => {
    test('accepts valid shortcut config', () => {
      const result = validateConfig({ shortcut: { doublePressWindowMs: 500, enabled: true } })
      expect(result).toEqual({ ok: true })
    })

    test('rejects non-object shortcut', () => {
      const result = validateConfig({ shortcut: 'fast' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('shortcut 必须是对象')
    })

    test('rejects non-number doublePressWindowMs', () => {
      const result = validateConfig({ shortcut: { doublePressWindowMs: 'fast' } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('shortcut.doublePressWindowMs 必须是 number')
    })

    test('rejects non-boolean enabled', () => {
      const result = validateConfig({ shortcut: { enabled: 'yes' } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('shortcut.enabled 必须是 boolean')
    })
  })

  describe('weather', () => {
    test('accepts valid weather config', () => {
      const result = validateConfig({
        weather: {
          cities: [{ latitude: 39.9, longitude: 116.4, cityLabel: '北京' }],
          ttlMinutes: 60,
        },
      })
      expect(result).toEqual({ ok: true })
    })

    test('rejects non-object weather', () => {
      const result = validateConfig({ weather: 'sunny' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('weather 必须是对象')
    })

    test('rejects old-style latitude/longitude at top level', () => {
      const result = validateConfig({
        weather: { latitude: 39.9, longitude: 116.4, cityLabel: '北京' },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('cities')
    })

    test('rejects empty cities array', () => {
      const result = validateConfig({ weather: { cities: [] } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('weather.cities 必须是非空数组')
    })

    test('rejects city with non-finite latitude', () => {
      const result = validateConfig({
        weather: { cities: [{ latitude: Infinity, longitude: 116.4, cityLabel: '北京' }] },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('latitude 必须是有限数')
    })

    test('rejects city with missing cityLabel', () => {
      const result = validateConfig({
        weather: { cities: [{ latitude: 39.9, longitude: 116.4 }] },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('cityLabel')
    })

    test('rejects non-positive ttlMinutes', () => {
      const result = validateConfig({
        weather: {
          cities: [{ latitude: 39.9, longitude: 116.4, cityLabel: '北京' }],
          ttlMinutes: 0,
        },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('weather.ttlMinutes 必须是正数')
    })
  })

  describe('v2ex', () => {
    test('accepts valid v2ex config', () => {
      const result = validateConfig({
        v2ex: { ttlMinutes: 30, todayMinReplies: 10, olderMinReplies: 20, ageHalfLifeDays: 2 },
      })
      expect(result).toEqual({ ok: true })
    })

    test('rejects non-object v2ex', () => {
      const result = validateConfig({ v2ex: 42 })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('v2ex 必须是对象')
    })

    test('rejects out-of-range ageHalfLifeDays', () => {
      const result = validateConfig({
        v2ex: { ttlMinutes: 30, todayMinReplies: 10, olderMinReplies: 20, ageHalfLifeDays: 31 },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('ageHalfLifeDays')
    })
  })

  describe('reddit', () => {
    test('accepts valid reddit config', () => {
      const result = validateConfig({
        reddit: {
          ttlMinutes: 30,
          todayMinComments: 10,
          olderMinComments: 20,
          ageHalfLifeDays: 2,
          subreddits: ['popular', 'javascript'],
        },
      })
      expect(result).toEqual({ ok: true })
    })

    test('rejects empty subreddits', () => {
      const result = validateConfig({
        reddit: { subreddits: [] },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('reddit.subreddits 必须是非空数组')
    })

    test('rejects non-string subreddit', () => {
      const result = validateConfig({
        reddit: { subreddits: ['popular', 42] },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('subreddits[1]')
    })
  })

  describe('novels', () => {
    test('accepts valid novels config', () => {
      const result = validateConfig({
        novels: {
          entries: [{ url: 'https://example.com/book' }],
          ttlMinutes: 60,
          initialNewChapters: 3,
          maxNewChaptersPerBook: 5,
          maxLatestWindow: 100,
        },
      })
      expect(result).toEqual({ ok: true })
    })

    test('rejects entry with invalid URL', () => {
      const result = validateConfig({
        novels: { entries: [{ url: 'not-a-url' }] },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('url 必须是有效 URL')
    })

    test('rejects entry with non-string alias', () => {
      const result = validateConfig({
        novels: { entries: [{ url: 'https://example.com', alias: 42 }] },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('alias')
    })
  })

  describe('tnews', () => {
    test('accepts valid tnews config', () => {
      const result = validateConfig({
        tnews: { ttlMinutes: 30 },
      })
      expect(result).toEqual({ ok: true })
    })

    test('rejects ttlMinutes <= 0', () => {
      const result = validateConfig({ tnews: { ttlMinutes: 0 } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('ttlMinutes')
    })
  })

  describe('xit', () => {
    test('accepts valid xit config', () => {
      const result = validateConfig({ xit: { enabled: true, placement: 'side' } })
      expect(result).toEqual({ ok: true })
    })

    test('rejects invalid placement', () => {
      const result = validateConfig({ xit: { placement: 'top' } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('xit.placement 必须是 "main" 或 "side"')
    })

    test('rejects non-boolean enabled', () => {
      const result = validateConfig({ xit: { enabled: 'yes' } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('xit.enabled 必须是 boolean')
    })
  })

  describe('hupu', () => {
    test('accepts valid hupu config', () => {
      const result = validateConfig({
        hupu: {
          ttlMinutes: 30,
          boards: ['vote-hot'],
          todayMinReplies: 10,
          olderMinReplies: 20,
          ageHalfLifeDays: 2,
          lightsWeight: 1,
          repliesWeight: 1,
        },
      })
      expect(result).toEqual({ ok: true })
    })

    test('rejects empty boards', () => {
      const result = validateConfig({ hupu: { boards: [] } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('hupu.boards 必须是非空数组')
    })
  })

  describe('sourceSettings', () => {
    test('accepts valid sourceSettings', () => {
      const result = validateConfig({
        sourceSettings: {
          v2ex: { tabTitle: 'V2EX', priority: 1, badgeType: 'default' },
        },
      })
      expect(result).toEqual({ ok: true })
    })

    test('rejects non-object sourceSettings', () => {
      const result = validateConfig({ sourceSettings: 'bad' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('sourceSettings 必须是对象')
    })

    test('rejects invalid badgeType', () => {
      const result = validateConfig({
        sourceSettings: { v2ex: { badgeType: 'invalid' } },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('badgeType')
    })

    test('rejects non-string tabTitle', () => {
      const result = validateConfig({
        sourceSettings: { v2ex: { tabTitle: 42 } },
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toContain('tabTitle')
    })
  })

  describe('xueqiu', () => {
    test('accepts valid xueqiu config', () => {
      const result = validateConfig({ xueqiu: { ttlMinutes: 30 } })
      expect(result).toEqual({ ok: true })
    })

    test('rejects non-object xueqiu', () => {
      const result = validateConfig({ xueqiu: 42 })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('xueqiu 必须是对象')
    })
  })

  describe('misc', () => {
    test('accepts valid misc config', () => {
      const result = validateConfig({ misc: { ttlMinutes: 10, badgeType: 'none' } })
      expect(result).toEqual({ ok: true })
    })

    test('rejects non-object misc', () => {
      const result = validateConfig({ misc: 'bad' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe('misc 必须是对象')
    })
  })
})
