import { describe, expect, test } from 'bun:test'
import {
  buildExportData,
  validateImportData,
  applyImportData,
  formatExportFilename,
} from '../../src/dashboard/export-import'
import { DEFAULT_CONFIG } from '../../src/dashboard/config'
import { CONFIG_KEY } from '../../src/dashboard/types'
import { createRuntime } from '../runtime'

describe('buildExportData', () => {
  test('exports config, xit content, and xit filters', async () => {
    const runtime = createRuntime()
    await runtime.setValue(CONFIG_KEY, {
      weather: { cities: [{ latitude: 31.23, longitude: 121.47, cityLabel: '上海' }] },
    })
    await runtime.setValue('dashboard:v2:xit', {
      schemaVersion: 2,
      data: { text: '[ ] task 1\n[x] task 2' },
      fetchedAt: 1700000000000,
    })
    await runtime.setValue('dashboard:v2:xit-filters', {
      filters: [{ id: 'f1', name: 'Open', query: 'status:open', isDefault: true }],
    })

    const data = await buildExportData(runtime)

    expect(data[CONFIG_KEY]).toEqual({
      weather: { cities: [{ latitude: 31.23, longitude: 121.47, cityLabel: '上海' }] },
    })
    expect(data['dashboard:v2:xit']).toEqual({
      schemaVersion: 2,
      data: { text: '[ ] task 1\n[x] task 2' },
      fetchedAt: 1700000000000,
      error: '',
    })
    expect(data['dashboard:v2:xit-filters']).toEqual({
      filters: [{ id: 'f1', name: 'Open', query: 'status:open', isDefault: true }],
    })
  })

  test('omits keys that are not set', async () => {
    const runtime = createRuntime()
    const data = await buildExportData(runtime)
    expect(Object.keys(data)).toEqual([])
  })

  test('exports only config when xit data is missing', async () => {
    const runtime = createRuntime()
    await runtime.setValue(CONFIG_KEY, { shortcut: { enabled: false } })
    const data = await buildExportData(runtime)
    expect(CONFIG_KEY in data).toBe(true)
    expect('dashboard:v2:xit' in data).toBe(false)
    expect('dashboard:v2:xit-filters' in data).toBe(false)
  })
})

describe('validateImportData', () => {
  test('accepts valid full data', () => {
    const result = validateImportData({
      [CONFIG_KEY]: {
        weather: { cities: [{ latitude: 31.23, longitude: 121.47, cityLabel: '上海' }] },
      },
      'dashboard:v2:xit': {
        schemaVersion: 2,
        data: { text: '[ ] task' },
        fetchedAt: 1700000000000,
      },
      'dashboard:v2:xit-filters': { filters: [] },
    })
    expect(result.ok).toBe(true)
  })

  test('accepts partial data (config only)', () => {
    const result = validateImportData({
      [CONFIG_KEY]: { shortcut: { enabled: false } },
    })
    expect(result.ok).toBe(true)
  })

  test('rejects non-object', () => {
    const result = validateImportData('not an object')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('JSON 对象')
    }
  })

  test('rejects array', () => {
    const result = validateImportData([1, 2, 3])
    expect(result.ok).toBe(false)
  })

  test('rejects empty object with no known keys', () => {
    const result = validateImportData({ unknownKey: 'value' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('不包含任何已知的配置键')
    }
  })

  test('rejects invalid config shape', () => {
    const result = validateImportData({
      [CONFIG_KEY]: { weather: { cities: 'not-an-array' } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('配置校验失败')
    }
  })

  test('rejects xit data without schemaVersion', () => {
    const result = validateImportData({
      'dashboard:v2:xit': { data: { text: 'task' } },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('schemaVersion')
    }
  })

  test('rejects xit data without data.text', () => {
    const result = validateImportData({
      'dashboard:v2:xit': { schemaVersion: 2, data: {} },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('data.text')
    }
  })

  test('rejects xit-filters without filters array', () => {
    const result = validateImportData({
      'dashboard:v2:xit-filters': { filters: 'not-array' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('filters 必须是数组')
    }
  })

  test('accepts xit-filters with empty filters array', () => {
    const result = validateImportData({
      'dashboard:v2:xit-filters': { filters: [] },
    })
    expect(result.ok).toBe(true)
  })
})

describe('applyImportData', () => {
  test('deep-merges config with existing', async () => {
    const runtime = createRuntime()
    await runtime.setValue(CONFIG_KEY, DEFAULT_CONFIG)

    const importData = {
      [CONFIG_KEY]: {
        weather: {
          cities: [{ latitude: 31.23, longitude: 121.47, cityLabel: '上海', cmaStationId: '' }],
        },
      },
    }
    const validation = validateImportData(importData)
    expect(validation.ok).toBe(true)
    await applyImportData(runtime, importData)

    const saved = (await runtime.getValue(CONFIG_KEY, null)) as unknown as typeof DEFAULT_CONFIG
    expect(saved.weather.cities).toEqual([
      { latitude: 31.23, longitude: 121.47, cityLabel: '上海', cmaStationId: '' },
    ])
    expect(saved.shortcut.enabled).toBe(true)
    expect(saved.xit.enabled).toBe(true)
  })

  test('replaces xit content entirely', async () => {
    const runtime = createRuntime()
    await runtime.setValue('dashboard:v2:xit', {
      schemaVersion: 2,
      data: { text: '[ ] old task' },
      fetchedAt: 1000,
    })

    const importData = {
      'dashboard:v2:xit': {
        schemaVersion: 2,
        data: { text: '[x] new task 1\n[ ] new task 2' },
        fetchedAt: 2000,
      },
    }
    await applyImportData(runtime, importData)

    const saved = (await runtime.getValue('dashboard:v2:xit', null)) as unknown as {
      data: { text: string }
    }
    expect(saved.data.text).toBe('[x] new task 1\n[ ] new task 2')
  })

  test('replaces xit filters entirely', async () => {
    const runtime = createRuntime()
    await runtime.setValue('dashboard:v2:xit-filters', {
      filters: [{ id: 'old', name: 'Old', query: 'old', isDefault: false }],
    })

    const importData = {
      'dashboard:v2:xit-filters': {
        filters: [{ id: 'new', name: 'New', query: 'new', isDefault: true }],
      },
    }
    await applyImportData(runtime, importData)

    const saved = (await runtime.getValue('dashboard:v2:xit-filters', null)) as unknown as {
      filters: Array<{ id: string }>
    }
    expect(saved.filters).toHaveLength(1)
    expect(saved.filters[0]!.id).toBe('new')
  })

  test('handles import with only some keys', async () => {
    const runtime = createRuntime()
    await runtime.setValue(CONFIG_KEY, DEFAULT_CONFIG)
    await runtime.setValue('dashboard:v2:xit-filters', {
      filters: [{ id: 'keep', name: 'Keep', query: 'q', isDefault: false }],
    })

    const importData = {
      'dashboard:v2:xit-filters': {
        filters: [{ id: 'replaced', name: 'Replaced', query: 'r', isDefault: true }],
      },
    }
    await applyImportData(runtime, importData)

    const config = (await runtime.getValue(CONFIG_KEY, null)) as unknown as typeof DEFAULT_CONFIG
    expect(config).toEqual(DEFAULT_CONFIG)
    const filters = (await runtime.getValue('dashboard:v2:xit-filters', null)) as unknown as {
      filters: Array<{ id: string }>
    }
    expect(filters.filters[0]!.id).toBe('replaced')
  })
})

describe('formatExportFilename', () => {
  test('returns filename with date pattern', () => {
    const filename = formatExportFilename()
    expect(filename).toMatch(/^gm-dashboard-export-\d{4}-\d{2}-\d{2}\.json$/)
  })
})
