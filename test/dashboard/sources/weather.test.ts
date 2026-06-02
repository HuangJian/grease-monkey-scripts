import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  buildWeatherUrl,
  createWeatherSource,
  fetchWeather,
  fetchWeatherAll,
  parseWeather,
  weatherCodeIcon,
} from '../../../src/dashboard/sources/weather'
import type { WeatherCity } from '../../../src/dashboard/types'
import type { Runtime, RequestDetails } from '../../../src/runtime'
import { createRuntime } from '../../runtime'

const FIXTURE = {
  latitude: 39.9,
  longitude: 116.4,
  current: {
    time: '2024-01-15T14:00',
    temperature_2m: 3.4,
    weather_code: 3,
  },
  daily: {
    time: ['2024-01-15', '2024-01-16'],
    temperature_2m_max: [5.1, 6.4],
    temperature_2m_min: [-2.0, -1.2],
    weather_code: [3, 1],
  },
}

function makeRuntime(dom: JSDOM, handler: (d: RequestDetails) => void): Runtime {
  const base = createRuntime(dom)
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

describe('buildWeatherUrl', () => {
  test('includes lat/lon and required params', () => {
    const url = buildWeatherUrl(31.23, 121.47)
    expect(url).toContain('latitude=31.23')
    expect(url).toContain('longitude=121.47')
    expect(url).toContain('current=temperature_2m%2Cweather_code')
    expect(url).toContain('forecast_days=2')
  })
})

describe('parseWeather', () => {
  test('parses a valid response', () => {
    const parsed = parseWeather(FIXTURE)
    expect(parsed?.current.temperature_2m).toBe(3.4)
    expect(parsed?.current.weather_code).toBe(3)
    expect(parsed?.daily.time).toHaveLength(2)
  })
  test('returns null on missing current', () => {
    expect(parseWeather({ daily: FIXTURE.daily })).toBeNull()
  })
  test('returns null on missing daily arrays', () => {
    expect(parseWeather({ current: FIXTURE.current })).toBeNull()
  })
  test('returns null on non-object input', () => {
    expect(parseWeather(null)).toBeNull()
    expect(parseWeather('nope')).toBeNull()
  })
})

describe('fetchWeather', () => {
  test('resolves with parsed data on 2xx response', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onload({ responseText: JSON.stringify(FIXTURE) }))
    const data = await fetchWeather(runtime, 39.9, 116.4)
    expect(data.current.temperature_2m).toBe(3.4)
  })
  test('rejects when onerror fires', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onerror?.())
    await expect(fetchWeather(runtime, 39.9, 116.4)).rejects.toThrow('network error')
  })
  test('rejects on bad JSON', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onload({ responseText: 'not-json' }))
    await expect(fetchWeather(runtime, 39.9, 116.4)).rejects.toThrow()
  })
})

describe('fetchWeatherAll', () => {
  const cities: WeatherCity[] = [
    { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
    { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
  ]
  test('returns ok entry per city when all fetch', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onload({ responseText: JSON.stringify(FIXTURE) }))
    const result = await fetchWeatherAll(runtime, cities)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].status).toBe('ok')
    expect(result.entries[1].status).toBe('ok')
    if (result.entries[0].status === 'ok') {
      expect(result.entries[0].cityLabel).toBe('BJ')
    }
  })
  test('marks failed city as error and keeps order', async () => {
    const dom = new JSDOM('<html></html>')
    const seen: string[] = []
    const runtime = makeRuntime(dom, (d) => {
      seen.push(d.url)
      if (d.url.includes('latitude=31.2')) {
        d.onerror?.()
      } else {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      }
    })
    const result = await fetchWeatherAll(runtime, cities)
    expect(seen).toHaveLength(2)
    expect(result.entries[0].status).toBe('ok')
    expect(result.entries[1].status).toBe('error')
    if (result.entries[1].status === 'error') {
      expect(result.entries[1].error).toBe('network error')
      expect(result.entries[1].cityLabel).toBe('SH')
    }
  })
  test('throws when no cities configured', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, () => {})
    await expect(fetchWeatherAll(runtime, [])).rejects.toThrow('no cities')
  })
})

describe('createWeatherSource.render', () => {
  function containerEl(): HTMLElement {
    const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
    return dom.window.document.getElementById('c')!
  }

  test('renders one city block per entry', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    source.render(container, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data: FIXTURE },
        { status: 'ok', cityLabel: 'SH', data: FIXTURE },
      ],
    })
    const blocks = container.querySelectorAll('.gm-sp-weather-city')
    expect(blocks).toHaveLength(2)
    const labels = container.querySelectorAll('.gm-sp-weather-city-label')
    expect(labels[0].textContent).toBe('BJ')
    expect(labels[1].textContent).toBe('SH')
    expect(container.querySelectorAll('.gm-sp-weather-day').length).toBeGreaterThan(0)
  })

  test('renders an error block for a failed city without dropping the others', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    source.render(container, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data: FIXTURE },
        { status: 'error', cityLabel: 'SH', error: 'network error' },
      ],
    })
    const labels = container.querySelectorAll('.gm-sp-weather-city-label')
    expect(labels[0].textContent).toBe('BJ')
    expect(labels[1].textContent).toBe('SH')
    const errors = container.querySelectorAll('.gm-sp-weather-error')
    expect(errors).toHaveLength(1)
    expect(errors[0].textContent).toBe('network error')
    const blocks = container.querySelectorAll('.gm-sp-weather-city')
    expect(blocks[1].querySelector('.gm-sp-weather-temp')!.textContent).toBe('--')
  })

  test('renders -- placeholder when data is null', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    source.render(container, null)
    expect(container.querySelector('.gm-sp-weather-empty')!.textContent).toBe('--')
  })

  test('uses fallback icon for unknown code', () => {
    expect(weatherCodeIcon(999)).toBe('🌡')
  })

  test('renders day cells with 今日/明日 labels', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' }],
      ttlMinutes: 60,
    })
    source.render(container, { entries: [{ status: 'ok', cityLabel: 'BJ', data: FIXTURE }] })
    expect(container.querySelector('.gm-sp-weather-temp')!.textContent).toBe('3°C')
    expect(container.querySelectorAll('.gm-sp-weather-day')).toHaveLength(2)
    expect(container.querySelector('.gm-sp-weather-day-label')!.textContent).toBe('今日')
  })
})
