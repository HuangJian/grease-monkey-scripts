import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { parseCmaNow } from '../../../src/dashboard/weather/cma/parse-now'
import { parseCmaPage } from '../../../src/dashboard/weather/cma/parse-page'

const FIXTURE_HTML = readFileSync(
  join(import.meta.dir, '..', 'fixtures', 'cma-beijing.html'),
  'utf8',
)
const FIXTURE_NOW = JSON.parse(
  readFileSync(join(import.meta.dir, '..', 'fixtures', 'cma-now.json'), 'utf8'),
) as unknown

function makeDOMParser(): typeof DOMParser {
  return DOMParser
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
    expect(result.hourly).not.toBeNull()
    const hourly = result.hourly!
    const year = new Date().getFullYear()
    expect(hourly.time).toHaveLength(8)
    expect(hourly.time[0]).toBe(`${year}-06-03T11:00`)
    expect(hourly.time[4]).toBe(`${year}-06-03T23:00`)
    expect(hourly.time[5]).toBe(`${year}-06-04T02:00`)
    expect(hourly.time[7]).toBe(`${year}-06-04T08:00`)
  })

  test('parses hourly temperature, weather codes, and parallel arrays', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    expect(result.hourly).not.toBeNull()
    const hourly = result.hourly!
    expect(hourly.temperature_2m[0]).toBe(28.3)
    expect(hourly.temperature_2m[1]).toBe(26)
    expect(hourly.weather_code[0]).toBe(2)
    expect(hourly.weather_code[1]).toBe(95)
    expect(hourly.pressure).toEqual([998, 996.9, 997.3, 999.5, 1001.1, 1001.4, 1001.6, 1002.7])
    expect(hourly.humidity?.[0]).toBe(59.7)
    expect(hourly.cloud_cover?.[0]).toBe(41.7)
  })

  test('parses precipitation as null for 无降水 and number for 0.1mm', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    expect(result.hourly).not.toBeNull()
    const hourly = result.hourly!
    expect(hourly.precipitation_amount?.[0]).toBeNull()
    expect(hourly.precipitation_amount?.[1]).toBe(0.1)
    expect(hourly.precipitation_amount?.[3]).toBe(0.5)
  })

  test('parses hourly wind speed (m/s) and direction (deg) from the page table', () => {
    const result = parseCmaPage(FIXTURE_HTML, makeDOMParser())!
    expect(result.hourly).not.toBeNull()
    const hourly = result.hourly!
    expect(hourly.wind_speed_10m).toEqual([2.5, 3.3, 1.9, 2.1, 2.8, 2.9, 2.6, 3.3])
    expect(hourly.wind_direction_10m).toEqual([45, 45, 45, 45, 135, 135, 315, 315])
  })

  test('returns null when no #dayList is present', () => {
    const html = '<html><body><p>not a cma page</p></body></html>'
    expect(parseCmaPage(html, makeDOMParser())).toBeNull()
  })

  test('returns daily with null hourly when hour table is missing (before 8am UTC+8)', () => {
    const html = `<html><body>
      <div id="dayList" class="row hb days">
        <div class="pull-left day actived">
          <div class="day-item">星期三<br />06/03</div>
          <div class="day-item dayicon"><img src="/static/img/w/icon/w1.png" /></div>
          <div class="day-item">多云</div>
          <div class="day-item">东北风</div>
          <div class="day-item">微风</div>
          <div class="day-item bardiv">
            <div class="bar" style="top: 3px; bottom: 2px">
              <div class="high">28℃</div>
              <div class="low">17℃</div>
            </div>
          </div>
        </div>
      </div>
    </body></html>`
    const result = parseCmaPage(html, makeDOMParser())
    expect(result).not.toBeNull()
    expect(result!.hourly).toBeNull()
    expect(result!.daily.time).toHaveLength(1)
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
