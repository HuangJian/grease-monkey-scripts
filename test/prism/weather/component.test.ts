import { describe, expect, test } from 'bun:test'
import { remainingHours } from '../../../src/prism/weather/component'
import type { WeatherHourly } from '../../../src/prism/weather/types'

const cmaHourly: WeatherHourly = {
  time: [
    '2026-06-20T14:00',
    '2026-06-20T17:00',
    '2026-06-20T20:00',
    '2026-06-20T23:00',
    '2026-06-21T02:00',
    '2026-06-21T05:00',
    '2026-06-21T08:00',
    '2026-06-21T11:00',
  ],
  temperature_2m: [28.9, 29.4, 23, 21.2, 19.9, 17.2, 23.3, 26.7],
  weather_code: [2, 2, 2, 0, 0, 0, 0, 2],
  precipitation_probability: [0, 0, 0, 0, 0, 0, 0, 0],
  pressure: [],
  humidity: [],
  cloud_cover: [],
  precipitation_amount: [],
  wind_speed_10m: [],
  wind_direction_10m: [],
}

describe('remainingHours', () => {
  test('CMA mode: returns future hours when current time is before all slots', () => {
    const indices = remainingHours(cmaHourly, '2026/06/20 10:00', true)
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  test('CMA mode: returns only future hours when current time is mid-day', () => {
    const indices = remainingHours(cmaHourly, '2026/06/20 18:00', true)
    expect(indices).toEqual([2, 3, 4, 5, 6, 7])
  })

  test('CMA mode: falls back to latest 8 slots when all hours are in the past', () => {
    // Bug scenario: CMA lastUpdate is 19:55 but latest hourly slot is 11:00.
    // Before the fix this returned [] and the UI showed "无小时数据".
    const indices = remainingHours(cmaHourly, '2026/06/21 19:55', true)
    expect(indices.length).toBeGreaterThan(0)
    expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  test('CMA mode: falls back to latest available when partially past', () => {
    // Current time is 12:00 — all 8 slots are at or before 12:00
    const indices = remainingHours(cmaHourly, '2026/06/21 12:00', true)
    expect(indices.length).toBeGreaterThan(0)
  })

  test('non-CMA mode: stops at day boundary', () => {
    const indices = remainingHours(cmaHourly, '2026/06/20 15:00', false)
    // Should include 17:00, 20:00, 23:00 (same day) but not 02:00+ (next day)
    expect(indices).toEqual([1, 2, 3])
  })

  test('non-CMA mode: returns empty when current time is past all slots', () => {
    const indices = remainingHours(cmaHourly, '2026/06/22 00:00', false)
    expect(indices).toEqual([])
  })
})
