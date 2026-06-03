import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { parseCmaNow, parseCmaPage } from '../../../src/dashboard/weather/cma'

const FIXTURE_HTML = readFileSync(
  join(import.meta.dir, '..', 'fixtures', 'cma-beijing.html'),
  'utf8',
)
const FIXTURE_NOW = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'fixtures', 'cma-now.json'), 'utf8'),
) as unknown

function makeDOMParser(): typeof DOMParser {
  return new JSDOM('').window.DOMParser
}

describe('parseCmaPage', () => {
  test('returns daily array with 2 days from the fixture', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())
    expect(result).not.toBeNull()
    expect(result!.daily.time).toHaveLength(2)
  })

  test('parses daily dates, high/low temps, and weather codes', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    const year = new Date().getFullYear()
    expect(result.daily.time[0]).toBe(`${year}-06-03`)
    expect(result.daily.time[1]).toBe(`${year}-06-04`)
    expect(result.daily.temperature_2m_max[0]).toBe(28)
    expect(result.daily.temperature_2m_min[0]).toBe(17)
    expect(result.daily.temperature_2m_max[1]).toBe(26)
    expect(result.daily.temperature_2m_min[1]).toBe(18)
  })

  test('maps day icon w1 to WMO partly-cloudy', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    expect(result.daily.weather_code[0]).toBe(2)
  })

  test('parses hourly table with 8 timepoints and aligns dates to today/tomorrow', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    const year = new Date().getFullYear()
    expect(result.hourly.time).toHaveLength(8)
    expect(result.hourly.time[0]).toBe(`${year}-06-03T11:00`)
    expect(result.hourly.time[4]).toBe(`${year}-06-03T23:00`)
    expect(result.hourly.time[5]).toBe(`${year}-06-04T02:00`)
    expect(result.hourly.time[7]).toBe(`${year}-06-04T08:00`)
  })

  test('parses hourly temperature, weather codes, and parallel arrays', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    expect(result.hourly.temperature_2m[0]).toBe(28.3)
    expect(result.hourly.temperature_2m[1]).toBe(26)
    expect(result.hourly.weather_code[0]).toBe(2)
    expect(result.hourly.weather_code[1]).toBe(95)
    expect(result.hourly.pressure).toEqual([
      998, 996.9, 997.3, 999.5, 1001.1, 1001.4, 1001.6, 1002.7,
    ])
    expect(result.hourly.humidity?.[0]).toBe(59.7)
    expect(result.hourly.cloud_cover?.[0]).toBe(41.7)
  })

  test('parses precipitation as null for 无降水 and number for 0.1mm', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    expect(result.hourly.precipitation_amount?.[0]).toBeNull()
    expect(result.hourly.precipitation_amount?.[1]).toBe(0.1)
    expect(result.hourly.precipitation_amount?.[3]).toBe(0.5)
  })

  test('returns null when no #dayList is present', () => {
    const html = '<html><body><p>not a cma page</p></body></html>'
    expect(parseCmaPage(html, makeDOMParser())).toBeNull()
  })
})

describe('parseCmaNow', () => {
  test('parses a valid response into WeatherCurrent fields', () => {
    const result = parseCmaNow(FIXTURE_NOW)
    expect(result).not.toBeNull()
    expect(result!.current.temperature_2m).toBe(27.5)
    expect(result!.current.humidity).toBe(62)
    expect(result!.current.pressure).toBe(998)
    expect(result!.current.wind_direction_10m).toBe(45)
    expect(result!.current.wind_speed_10m).toBeCloseTo(4.4, 1)
    expect(result!.current.source).toBe('cma')
    expect(result!.lastUpdate).toBe('2024-06-03 11:30')
  })

  test('returns null when code is not 0', () => {
    expect(parseCmaNow({ code: 1 })).toBeNull()
  })

  test('returns null when data is missing', () => {
    expect(parseCmaNow({ code: 0 })).toBeNull()
  })

  test('returns null when given non-object input', () => {
    expect(parseCmaNow(null)).toBeNull()
    expect(parseCmaNow('bad')).toBeNull()
  })
})
