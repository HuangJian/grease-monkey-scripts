import { describe, expect, test } from 'bun:test'
import { reconcileEntry } from '../../../src/prism/weather/source'
import { CMA_RETENTION_MS } from '../../../src/prism/weather/constants'
import type { WeatherCityData, WeatherCityEntry } from '../../../src/prism/weather/types'

function makeOkEntry(
  cityLabel: string,
  overrides: Partial<WeatherCityData> = {},
): WeatherCityEntry {
  return {
    status: 'ok',
    cityLabel,
    data: {
      current: {
        time: '2026-07-11T10:00',
        temperature_2m: 25,
        apparent_temperature: 24,
        weather_code: 0,
        wind_speed_10m: 10,
        wind_direction_10m: 180,
        air_quality: null,
        humidity: 50,
        pressure: 1010,
        precipitation: 0,
        source: 'cma',
      },
      hourly: {
        time: [],
        temperature_2m: [],
        weather_code: [],
        precipitation_probability: [],
        pressure: [],
        humidity: [],
        cloud_cover: [],
        precipitation_amount: [],
        wind_speed_10m: [],
        wind_direction_10m: [],
      },
      daily: {
        time: [],
        temperature_2m_max: [],
        temperature_2m_min: [],
        weather_code: [],
        precipitation_probability_max: [],
        precipitation_sum: [],
      },
      cmaUrl: 'https://weather.cma.cn/web/weather/54511.html',
      cmaFailed: false,
      ...overrides,
    },
  }
}

function makeErrorEntry(cityLabel: string, error = 'network error'): WeatherCityEntry {
  return { status: 'error', cityLabel, error }
}

const NOW = 1_700_000_000_000

describe('reconcileEntry', () => {
  test('error entry falls back to previous ok entry', () => {
    const prev = makeOkEntry('北京')
    const entry = makeErrorEntry('北京')
    const result = reconcileEntry(entry, prev, NOW)
    expect(result.status).toBe('ok')
    expect(result).toEqual({ ...prev })
  })

  test('error entry with no previous stays as error', () => {
    const entry = makeErrorEntry('北京')
    const result = reconcileEntry(entry, undefined, NOW)
    expect(result.status).toBe('error')
  })

  test('error entry with previous error stays as error', () => {
    const prev = makeErrorEntry('北京')
    const entry = makeErrorEntry('北京')
    const result = reconcileEntry(entry, prev, NOW)
    expect(result.status).toBe('error')
  })

  test('cmaFailed entry retains previous CMA data if within retention window', () => {
    const cmaFetchedAt = NOW - 2 * 60 * 60 * 1000 // 2 hours ago
    const prev = makeOkEntry('北京', { cmaFetchedAt })
    const entry = makeOkEntry('北京', { cmaFailed: true, cmaFetchedAt: undefined })
    const result = reconcileEntry(entry, prev, NOW)
    expect(result.status).toBe('ok')
    expect(result).toEqual({ ...prev })
  })

  test('cmaFailed entry does NOT retain if previous CMA data is too old', () => {
    const cmaFetchedAt = NOW - CMA_RETENTION_MS - 1 // just past retention
    const prev = makeOkEntry('北京', { cmaFetchedAt })
    const entry = makeOkEntry('北京', { cmaFailed: true, cmaFetchedAt: undefined })
    const result = reconcileEntry(entry, prev, NOW)
    // Should return the new (degraded) entry, not the previous one
    expect(result).toBe(entry)
  })

  test('cmaFailed entry does NOT retain if previous has no cmaFetchedAt', () => {
    const prev = makeOkEntry('北京', { cmaFetchedAt: undefined })
    const entry = makeOkEntry('北京', { cmaFailed: true, cmaFetchedAt: undefined })
    const result = reconcileEntry(entry, prev, NOW)
    expect(result).toBe(entry)
  })

  test('cmaFailed entry does NOT retain if previous was also cmaFailed', () => {
    const prev = makeOkEntry('北京', { cmaFailed: true, cmaFetchedAt: undefined })
    const entry = makeOkEntry('北京', { cmaFailed: true, cmaFetchedAt: undefined })
    const result = reconcileEntry(entry, prev, NOW)
    expect(result).toBe(entry)
  })

  test('successful CMA entry passes through unchanged', () => {
    const prev = makeOkEntry('北京', { cmaFetchedAt: NOW - 1000 })
    const entry = makeOkEntry('北京', { cmaFetchedAt: NOW })
    const result = reconcileEntry(entry, prev, NOW)
    expect(result).toBe(entry)
  })

  test('retention works at exact boundary (age == retention)', () => {
    const cmaFetchedAt = NOW - CMA_RETENTION_MS
    const prev = makeOkEntry('北京', { cmaFetchedAt })
    const entry = makeOkEntry('北京', { cmaFailed: true, cmaFetchedAt: undefined })
    const result = reconcileEntry(entry, prev, NOW)
    // age == retention is NOT < retention, so should not retain
    expect(result).toBe(entry)
  })

  test('retention propagates cmaFetchedAt through multiple failures', () => {
    // Simulate: first fetch CMA success at T0, second fetch CMA fail (retain T0),
    // third fetch CMA fail (should still retain from T0 if within window)
    const t0 = NOW - 3 * 60 * 60 * 1000 // 3 hours ago
    const prevAfterSecondFetch = makeOkEntry('北京', {
      cmaFailed: false,
      cmaFetchedAt: t0,
    })
    const thirdEntry = makeOkEntry('北京', { cmaFailed: true, cmaFetchedAt: undefined })
    const result = reconcileEntry(thirdEntry, prevAfterSecondFetch, NOW)
    expect(result.status).toBe('ok')
    expect(result).toEqual({ ...prevAfterSecondFetch })
  })
})
