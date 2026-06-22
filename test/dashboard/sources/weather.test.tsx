import { afterEach, describe, expect, test } from 'bun:test'
import { render, cleanup, within } from '@testing-library/preact'
import type { ComponentType } from 'preact'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  aqiLevel,
  buildAirQualityUrl,
  buildWeatherUrl,
  createWeatherSource,
  fetchAirQuality,
  fetchWeather,
  fetchWeatherAll,
  FORECAST_DAYS,
  parseAirQuality,
  parseWeather,
  weatherCodeIcon,
  windDirectionArrow,
} from '../../../src/dashboard/weather'
import { CONFIG_KEY } from '../../../src/dashboard/types'
import type { WeatherCity } from '../../../src/dashboard/weather/types'
import type { Runtime, RequestDetails } from '../../../src/runtime'
import { createRuntime } from '../../runtime'
import type { TestRuntime } from '../../runtime'

const FIXTURE = {
  latitude: 39.9,
  longitude: 116.4,
  current: {
    time: '2024-01-15T14:00',
    temperature_2m: 3.4,
    apparent_temperature: 0.1,
    weather_code: 3,
    wind_speed_10m: 12.5,
    wind_direction_10m: 45,
  },
  hourly: {
    time: [
      '2024-01-15T00:00',
      '2024-01-15T01:00',
      '2024-01-15T02:00',
      '2024-01-15T14:00',
      '2024-01-15T15:00',
      '2024-01-15T23:00',
      '2024-01-16T00:00',
    ],
    temperature_2m: [-1, -2, -2, 3, 3, -1, -1],
    weather_code: [3, 3, 3, 3, 3, 3, 1],
    precipitation_probability: [0, 0, 0, 0, 10, 60, 10],
    precipitation_amount: [0, 0, 0, 0, 0.5, 0, 0],
  },
  daily: {
    time: ['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18'],
    temperature_2m_max: [5.1, 6.4, 4.0, 2.0],
    temperature_2m_min: [-2.0, -1.2, -3.0, -4.0],
    weather_code: [3, 1, 51, 71],
    precipitation_probability_max: [20, 10, 60, 80],
    precipitation_sum: [0, 0, 1.2, 3.5],
  },
}

const AIR_QUALITY = {
  latitude: 39.9,
  longitude: 116.4,
  current: { us_aqi: 42, pm2_5: 8.1, pm10: 12.3 },
}

function makeRuntime(handler: (d: RequestDetails) => void): Runtime {
  const base = createRuntime()
  return { ...base, request: (d: RequestDetails) => handler(d) }
}

afterEach(cleanup)

describe('buildWeatherUrl', () => {
  test('includes lat/lon and required params', () => {
    const url = buildWeatherUrl(31.23, 121.47)
    expect(url).toContain('latitude=31.23')
    expect(url).toContain('longitude=121.47')
    expect(url).toContain('current=temperature_2m%2Capparent_temperature')
    expect(url).toContain('wind_speed_10m%2Cwind_direction_10m')
    expect(url).toContain('hourly=temperature_2m%2Cweather_code%2Cprecipitation_probability')
    expect(url).toContain(`forecast_days=${FORECAST_DAYS}`)
  })
})

describe('buildAirQualityUrl', () => {
  test('targets air-quality host and includes us_aqi', () => {
    const url = buildAirQualityUrl(31.23, 121.47)
    expect(url.startsWith('https://air-quality-api.open-meteo.com/')).toBe(true)
    expect(url).toContain('current=us_aqi%2Cpm2_5%2Cpm10')
    expect(url).toContain('latitude=31.23')
  })
})

describe('parseWeather', () => {
  test('parses a valid response with new fields', () => {
    const parsed = parseWeather(FIXTURE)
    expect(parsed?.current.temperature_2m).toBe(3.4)
    expect(parsed?.current.apparent_temperature).toBe(0.1)
    expect(parsed?.current.wind_speed_10m).toBe(12.5)
    expect(parsed?.current.wind_direction_10m).toBe(45)
    expect(parsed?.current.air_quality).toBeNull()
    expect(parsed?.daily.time).toHaveLength(4)
    expect(parsed?.daily.precipitation_probability_max).toHaveLength(4)
    expect(parsed?.hourly.time.length).toBeGreaterThan(0)
    expect(parsed?.hourly.precipitation_probability[0]).toBe(0)
  })
  test('returns null on missing current extended fields', () => {
    expect(
      parseWeather({
        ...FIXTURE,
        current: { ...FIXTURE.current, apparent_temperature: undefined },
      }),
    ).toBeNull()
  })
  test('returns null on missing hourly block', () => {
    const { hourly, ...rest } = FIXTURE
    void hourly
    expect(parseWeather(rest)).toBeNull()
  })
  test('returns null on non-object input', () => {
    expect(parseWeather(null)).toBeNull()
    expect(parseWeather('nope')).toBeNull()
  })
})

describe('parseAirQuality', () => {
  test('parses us_aqi/pm2_5/pm10', () => {
    expect(parseAirQuality(AIR_QUALITY)).toEqual({ us_aqi: 42, pm2_5: 8.1, pm10: 12.3 })
  })
  test('returns null on missing us_aqi', () => {
    expect(parseAirQuality({ current: { pm2_5: 1 } })).toBeNull()
  })
  test('returns null on non-object input', () => {
    expect(parseAirQuality(null)).toBeNull()
    expect(parseAirQuality('nope')).toBeNull()
  })
})

describe('fetchAirQuality', () => {
  test('resolves with parsed data', async () => {
    const runtime = makeRuntime((d) => d.onload({ responseText: JSON.stringify(AIR_QUALITY) }))
    const aq = await fetchAirQuality(runtime, 39.9, 116.4)
    expect(aq.us_aqi).toBe(42)
  })
  test('rejects on bad JSON', async () => {
    const runtime = makeRuntime((d) => d.onload({ responseText: 'nope' }))
    await expect(fetchAirQuality(runtime, 39.9, 116.4)).rejects.toThrow()
  })
})

describe('fetchWeather', () => {
  test('resolves with parsed data and air_quality on success', async () => {
    let i = 0
    const runtime = makeRuntime((d) => {
      if (i++ === 0) d.onload({ responseText: JSON.stringify(FIXTURE) })
      else d.onload({ responseText: JSON.stringify(AIR_QUALITY) })
    })
    const data = await fetchWeather(runtime, 39.9, 116.4)
    expect(data.current.temperature_2m).toBe(3.4)
    expect(data.current.air_quality?.us_aqi).toBe(42)
  })
  test('still resolves when AQI call fails (air_quality null)', async () => {
    let i = 0
    const runtime = makeRuntime((d) => {
      if (i++ === 0) d.onload({ responseText: JSON.stringify(FIXTURE) })
      else d.onerror?.()
    })
    const data = await fetchWeather(runtime, 39.9, 116.4)
    expect(data.current.air_quality).toBeNull()
  })
  test('rejects when weather call fails', async () => {
    const runtime = makeRuntime((d) => d.onerror?.())
    await expect(fetchWeather(runtime, 39.9, 116.4)).rejects.toThrow('network error')
  })
  test('rejects on bad JSON', async () => {
    const runtime = makeRuntime((d) => d.onload({ responseText: 'not-json' }))
    await expect(fetchWeather(runtime, 39.9, 116.4)).rejects.toThrow()
  })
})

describe('fetchWeatherAll', () => {
  const cities: WeatherCity[] = [
    { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
    { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
  ]
  test('returns ok entry per city when all fetch', async () => {
    const runtime = makeRuntime((d) => {
      if (d.url.includes('air-quality-api')) {
        d.onload({ responseText: JSON.stringify(AIR_QUALITY) })
      } else {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      }
    })
    const result = await fetchWeatherAll(runtime, cities)
    expect(result.entries).toHaveLength(2)
    expect(result.entries[0].status).toBe('ok')
    expect(result.entries[1].status).toBe('ok')
    if (result.entries[0].status === 'ok') {
      expect(result.entries[0].cityLabel).toBe('BJ')
      expect(result.entries[0].data.current.air_quality?.us_aqi).toBe(42)
    }
  })
  test('marks failed city as error and keeps order', async () => {
    const seen: string[] = []
    const runtime = makeRuntime((d) => {
      seen.push(d.url)
      if (d.url.includes('latitude=31.2')) {
        d.onerror?.()
      } else if (d.url.includes('air-quality-api')) {
        d.onload({ responseText: JSON.stringify(AIR_QUALITY) })
      } else {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      }
    })
    const result = await fetchWeatherAll(runtime, cities)
    expect(result.entries[0].status).toBe('ok')
    expect(result.entries[1].status).toBe('error')
    if (result.entries[1].status === 'error') {
      expect(result.entries[1].error).toBe('network error')
      expect(result.entries[1].cityLabel).toBe('SH')
    }
    expect(seen.some((u) => u.includes('latitude=31.2'))).toBe(true)
    expect(seen.some((u) => u.includes('latitude=39.9'))).toBe(true)
  })
  test('throws when no cities configured', async () => {
    const runtime = makeRuntime(() => {})
    await expect(fetchWeatherAll(runtime, [])).rejects.toThrow('no cities')
  })

  test('merges CMA daily + current into Open-Meteo base when cmaStationId is set', async () => {
    const cmaPageHtml = readFileSync(
      join(import.meta.dir, '..', 'fixtures', 'cma-beijing.html'),
      'utf8',
    )
    const cmaNowJson = readFileSync(join(import.meta.dir, '..', 'fixtures', 'cma-now.json'), 'utf8')
    const runtime = makeRuntime((d) => {
      if (d.url.includes('weather.cma.cn/web/weather/')) {
        d.onload({ responseText: cmaPageHtml })
      } else if (d.url.includes('weather.cma.cn/api/now/')) {
        d.onload({ responseText: cmaNowJson })
      } else if (d.url.includes('air-quality-api')) {
        d.onload({ responseText: JSON.stringify(AIR_QUALITY) })
      } else {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      }
    })
    const result = await fetchWeatherAll(runtime, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ', cmaStationId: '54511' },
    ])
    expect(result.entries).toHaveLength(1)
    if (result.entries[0]?.status !== 'ok') throw new Error('expected ok')
    const data = result.entries[0].data
    expect(data.current.source).toBe('cma')
    expect(data.current.temperature_2m).toBe(27.5)
    expect(data.current.humidity).toBe(62)
    expect(data.current.pressure).toBe(998)
    expect(data.current.wind_direction_10m).toBe(45)
    expect(data.current.wind_speed_10m).toBeCloseTo(9.0, 1)
    expect(data.hourly.wind_speed_10m?.[0]).toBe(2.5)
    expect(data.hourly.wind_direction_10m?.[0]).toBe(45)
    expect(data.current.air_quality?.us_aqi).toBe(42)
    expect(data.daily.time.length).toBeGreaterThanOrEqual(2)
    expect(data.daily.temperature_2m_max[0]).toBe(28)
    expect(data.hourly.temperature_2m[0]).toBe(28.3)
  })

  test('uses CMA page wind speed (m/s) instead of JSON windScale Beaufort midpoints', async () => {
    const cmaPageHtml = readFileSync(
      join(import.meta.dir, '..', 'fixtures', 'cma-beijing.html'),
      'utf8',
    )
    const cmaNowCalm = JSON.stringify({
      code: 0,
      data: {
        lastUpdate: '2024-06-03 11:30',
        now: {
          temperature: 27.5,
          pressure: 998,
          humidity: 62,
          precipitation: 0,
          windDirection: '东北风',
          windScale: '0级',
        },
        alarm: [],
      },
    })
    const runtime = makeRuntime((d) => {
      if (d.url.includes('weather.cma.cn/web/weather/')) {
        d.onload({ responseText: cmaPageHtml })
      } else if (d.url.includes('weather.cma.cn/api/now/')) {
        d.onload({ responseText: cmaNowCalm })
      } else if (d.url.includes('air-quality-api')) {
        d.onload({ responseText: JSON.stringify(AIR_QUALITY) })
      } else {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      }
    })
    const result = await fetchWeatherAll(runtime, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ', cmaStationId: '54511' },
    ])
    if (result.entries[0]?.status !== 'ok') throw new Error('expected ok')
    const data = result.entries[0].data
    expect(data.current.wind_speed_10m).toBeCloseTo(9.0, 1)
  })

  test('falls back to Open-Meteo when CMA page HTML fails', async () => {
    const runtime = makeRuntime((d) => {
      if (d.url.includes('weather.cma.cn/web/weather/')) {
        d.onerror?.()
      } else if (d.url.includes('weather.cma.cn/api/now/')) {
        d.onerror?.()
      } else if (d.url.includes('air-quality-api')) {
        d.onload({ responseText: JSON.stringify(AIR_QUALITY) })
      } else {
        d.onload({ responseText: JSON.stringify(FIXTURE) })
      }
    })
    const result = await fetchWeatherAll(runtime, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ', cmaStationId: '54511' },
    ])
    if (result.entries[0]?.status !== 'ok') throw new Error('expected ok')
    expect(result.entries[0].data.current.source).toBe('open-meteo')
  })
})

describe('aqiLevel', () => {
  test('returns Chinese label and color for each tier', () => {
    expect(aqiLevel(20)).toEqual({ label: '优', color: '#10b981' })
    expect(aqiLevel(80)).toEqual({ label: '良', color: '#eab308' })
    expect(aqiLevel(120)).toEqual({ label: '轻污染', color: '#f97316' })
    expect(aqiLevel(180)).toEqual({ label: '中污染', color: '#ef4444' })
    expect(aqiLevel(250)).toEqual({ label: '重污染', color: '#a855f7' })
    expect(aqiLevel(400)).toEqual({ label: '严重', color: '#7f1d1d' })
  })
  test('falls back to -- for null/NaN', () => {
    expect(aqiLevel(null).label).toBe('--')
    expect(aqiLevel(undefined).label).toBe('--')
    expect(aqiLevel(Number.NaN).label).toBe('--')
  })
})

describe('windDirectionArrow', () => {
  test('returns arrow for finite degrees', () => {
    expect(windDirectionArrow(0)).toBe('↑')
    expect(windDirectionArrow(180)).toBe('↑')
  })
  test('returns dot for invalid degrees', () => {
    expect(windDirectionArrow(Number.NaN)).toBe('·')
  })
})

describe('createWeatherSource', () => {
  test('declares side placement', () => {
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    expect(source.placement).toBe('side')
  })

  test('fetch reads cities from storage over options.cities', async () => {
    const runtime = createRuntime() as TestRuntime
    const omBody = JSON.stringify(FIXTURE)
    const aqBody = JSON.stringify(AIR_QUALITY)
    runtime.queueResponse(
      'https://api.open-meteo.com/v1/forecast?latitude=31.2&longitude=121.5&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&hourly=temperature_2m,weather_code,precipitation_probability&timezone=auto&forecast_days=3',
      omBody,
    )
    runtime.queueResponse(
      'https://air-quality-api.open-meteo.com/v1/air-quality?latitude=31.2&longitude=121.5&current=us_aqi,pm2_5,pm10&timezone=auto',
      aqBody,
    )
    runtime.stores[CONFIG_KEY] = {
      weather: {
        cities: [{ latitude: 31.2, longitude: 121.5, cityLabel: '上海' }],
        ttlMinutes: 60,
      },
    }
    const source = createWeatherSource({
      cities: [{ latitude: 39.9, longitude: 116.4, cityLabel: '北京' }],
      ttlMinutes: 60,
    })
    const result = await source.fetch(runtime)
    expect(result.entries).toHaveLength(1)
    if (result.entries[0]!.status === 'ok') {
      expect(result.entries[0]!.cityLabel).toBe('上海')
    }
  })
})

describe('createWeatherSource.render', () => {
  function containerEl(): HTMLElement {
    const el = document.createElement('div')
    el.id = 'c'
    return el
  }

  function renderComponent(
    container: HTMLElement,
    source: { RenderComponent?: ComponentType<any> },
    data: unknown,
  ) {
    const Comp = source.RenderComponent!
    render(<Comp data={data} />, { container })
  }

  function buildData() {
    return {
      entries: [
        {
          status: 'ok' as const,
          cityLabel: 'BJ',
          data: {
            current: {
              time: '2024-01-15T14:00',
              temperature_2m: 3.4,
              apparent_temperature: 0.1,
              weather_code: 3,
              wind_speed_10m: 12.5,
              wind_direction_10m: 45,
              air_quality: { us_aqi: 42, pm2_5: 8.1, pm10: 12.3 },
              precipitation: 0,
            },
            hourly: FIXTURE.hourly,
            daily: FIXTURE.daily,
          },
        },
      ],
    }
  }

  test('renders -- placeholder when data is null', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    renderComponent(container, source, null)
    expect(within(container).getByText('--')).not.toBeNull()
  })

  test('uses fallback icon for unknown code', () => {
    expect(weatherCodeIcon(999)).toBe('🌡')
  })

  test('renders AQI badge with US AQI value and Chinese level (no AQI prefix)', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    renderComponent(container, source, buildData())
    const aqi = within(container).getByText('42 优') as HTMLElement
    expect(aqi.textContent).toBe('42 优')
    expect(aqi.style.getPropertyValue('--gm-sp-aqi-color')).toBe('#10b981')
  })

  test('falls back to -- AQI when air quality missing', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      ;(data.entries[0]!.data.current as unknown as { air_quality: null }).air_quality = null
    }
    renderComponent(container, source, data)
    const aqiEl = container.querySelector('.gm-sp-weather-aqi')
    expect(aqiEl).not.toBeNull()
    expect(aqiEl!.textContent).toBe('--')
  })

  test('renders single-line summary with range, AQI, and chips', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: '合肥' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      data.entries[0]!.data.current.precipitation = 2.5
      data.entries[0]!.cityLabel = '合肥'
    }
    renderComponent(container, source, data)
    expect(within(container).getByText('-2°~5°')).not.toBeNull()
    within(container).getByText('🌡️ 0°')
    within(container).getByText('12.5 km/h')
    const arrow = within(container).getByText('↑') as HTMLElement
    expect(arrow.style.getPropertyValue('--gm-sp-wind-rot')).toBe('225deg')
    const precipChip = within(container).getByText(/2\.5mm/) as HTMLElement
    expect(precipChip.classList.contains('gm-sp-weather-precip')).toBe(true)
    expect(precipChip.textContent!.replace(/\s+/g, ' ').trim()).toContain('2.5mm')
  })

  test('renders humidity chip when current.humidity is present', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      ;(data.entries[0]!.data.current as { humidity?: number }).humidity = 65
    }
    renderComponent(container, source, data)
    within(container).getByText('💧 65%')
  })

  test('omits humidity chip when current.humidity is absent', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    renderComponent(container, source, buildData())
    expect(within(container).queryByText(/💧/)).toBeNull()
  })

  test('wind arrow rotates +180deg so a north wind points south', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      data.entries[0]!.data.current.wind_direction_10m = 0
    }
    renderComponent(container, source, data)
    const arrow = within(container).getByText('↑') as HTMLElement
    expect(arrow.style.getPropertyValue('--gm-sp-wind-rot')).toBe('180deg')
  })

  test('wind arrow wraps at 360deg for 270deg wind (becomes 90deg)', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      data.entries[0]!.data.current.wind_direction_10m = 270
    }
    renderComponent(container, source, data)
    const arrow = within(container).getByText('↑') as HTMLElement
    expect(arrow.style.getPropertyValue('--gm-sp-wind-rot')).toBe('90deg')
  })

  test('renders source attribution with CMA link when cmaUrl is set', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      const cur = data.entries[0]!.data
      ;(cur.current as { source?: 'open-meteo' | 'cma' }).source = 'cma'
      ;(cur as { cmaUrl?: string }).cmaUrl = 'https://weather.cma.cn/web/weather/54511.html'
    }
    renderComponent(container, source, data)
    const link = within(container).getByRole('link', { name: '气象局' }) as HTMLAnchorElement
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('https://weather.cma.cn/web/weather/54511.html')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  test('omits source attribution when cmaUrl is missing even if source is cma', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      ;(data.entries[0]!.data.current as { source?: 'open-meteo' | 'cma' }).source = 'cma'
    }
    renderComponent(container, source, data)
    expect(within(container).queryByText('气象局')).toBeNull()
  })

  test('renders hourly cells only for remaining hours of current day', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    renderComponent(container, source, buildData())
    // FIXTURE hourly: 3 entries for 2024-01-15 before 14:00 are skipped,
    // 14:00, 15:00, 23:00 remain (3); 2024-01-16 entries are after current day.
    const times = within(container)
      .getAllByText(/^\d{2}:\d{2}$/)
      .map((e) => e.textContent)
    expect(times).toEqual(['14:00', '15:00', '23:00'])
  })

  test('renders all CMA hourly slots including next-morning hours when source is cma', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      const cur = data.entries[0]!.data
      ;(cur.current as { source?: 'open-meteo' | 'cma' }).source = 'cma'
      cur.current.time = '2024-01-15 11:00'
      cur.hourly = {
        time: [
          '2024-01-15T11:00',
          '2024-01-15T14:00',
          '2024-01-15T17:00',
          '2024-01-15T20:00',
          '2024-01-15T23:00',
          '2024-01-16T02:00',
          '2024-01-16T05:00',
          '2024-01-16T08:00',
        ],
        temperature_2m: [22, 24, 23, 21, 19, 17, 16, 18],
        weather_code: [1, 1, 2, 3, 3, 2, 2, 1],
        precipitation_probability: [0, 0, 0, 0, 0, 0, 0, 0],
        precipitation_amount: [0, 0, 0, 0, 0, 0, 0, 0],
      }
    }
    renderComponent(container, source, data)
    const times = within(container)
      .getAllByText(/^\d{2}:\d{2}$/)
      .map((e) => e.textContent)
    expect(times).toEqual(['11:00', '14:00', '17:00', '20:00', '23:00', '02:00', '05:00', '08:00'])
  })

  test('caps CMA hourly at 8 cells when more are available', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X', cmaStationId: '54511' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      const cur = data.entries[0]!.data
      ;(cur.current as { source?: 'open-meteo' | 'cma' }).source = 'cma'
      cur.current.time = '2024-01-15 09:00'
      cur.hourly = {
        time: [
          '2024-01-15T05:00',
          '2024-01-15T08:00',
          '2024-01-15T11:00',
          '2024-01-15T14:00',
          '2024-01-15T17:00',
          '2024-01-15T20:00',
          '2024-01-15T23:00',
          '2024-01-16T02:00',
          '2024-01-16T05:00',
          '2024-01-16T08:00',
        ],
        temperature_2m: [15, 18, 22, 24, 23, 21, 19, 17, 16, 18],
        weather_code: [1, 1, 1, 1, 2, 3, 3, 2, 2, 1],
        precipitation_probability: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        precipitation_amount: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      }
    }
    renderComponent(container, source, data)
    expect(within(container).getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(8)
  })

  test('renders CMA hourly when current.time uses YYYY/MM/DD HH:MM (CMA /api/now format)', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X', cmaStationId: '54511' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      const cur = data.entries[0]!.data
      ;(cur.current as { source?: 'open-meteo' | 'cma' }).source = 'cma'
      cur.current.time = '2026/06/03 10:35'
      cur.hourly = {
        time: [
          '2026-06-03T11:00',
          '2026-06-03T14:00',
          '2026-06-03T17:00',
          '2026-06-03T20:00',
          '2026-06-03T23:00',
          '2026-06-04T02:00',
          '2026-06-04T05:00',
          '2026-06-04T08:00',
        ],
        temperature_2m: [30, 32, 31, 28, 26, 25, 25, 27],
        weather_code: [1, 1, 2, 3, 3, 3, 2, 1],
        precipitation_probability: [0, 0, 0, 0, 0, 0, 0, 0],
        precipitation_amount: [0, 0, 0, 0, 0, 0, 0, 0],
      }
    }
    renderComponent(container, source, data)
    expect(within(container).getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(8)
  })

  test('renders 3 day pills for +1/+2/+3 only (today moved to summary)', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    renderComponent(container, source, buildData())
    const dayLabelEls = within(container).getAllByText(/^\+\d$/)
    expect(dayLabelEls).toHaveLength(3)
    expect(dayLabelEls.map((e) => e.textContent)).toEqual(['+1', '+2', '+3'])
    const dayPrecipEls = dayLabelEls.map(
      (el) =>
        within(el.closest('.gm-sp-weather-day') as HTMLElement).getByText(/^(?:--|[\d.]+mm)$/)
          .textContent,
    )
    expect(dayPrecipEls).toEqual(['0.0mm', '1.2mm', '3.5mm'])
  })

  test('clicking city tab in header switches body to that city', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 0, longitude: 0, cityLabel: 'BJ' },
        { latitude: 30, longitude: 120, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })

    const data = {
      entries: [
        {
          status: 'ok' as const,
          cityLabel: 'BJ',
          data: {
            current: { ...FIXTURE.current, temperature_2m: 3 },
            hourly: FIXTURE.hourly,
            daily: FIXTURE.daily,
          },
        },
        {
          status: 'ok' as const,
          cityLabel: 'SH',
          data: {
            current: { ...FIXTURE.current, temperature_2m: 25 },
            hourly: FIXTURE.hourly,
            daily: FIXTURE.daily,
          },
        },
      ],
    }

    function rerender() {
      const HeaderComp = source.RenderHeader!
      const BodyComp = source.RenderComponent!
      render(
        <div>
          <HeaderComp
            data={data}
            cached={null}
            now={0}
            ttlMs={60000}
            runtime={createRuntime()}
            root={undefined as any}
            onRefresh={async () => {}}
            onHeaderChange={() => rerender()}
          />
          <BodyComp
            data={data}
            root={undefined as any}
            runtime={createRuntime()}
            onHeaderChange={() => rerender()}
          />
        </div>,
        { container },
      )
    }

    rerender()

    // Initially: BJ panel active, SH panel hidden
    const panels = container.querySelectorAll('.gm-sp-panel')
    expect(panels).toHaveLength(2)
    expect(panels[0]!.classList.contains('gm-sp-panel-active')).toBe(true)
    expect(panels[1]!.classList.contains('gm-sp-panel-active')).toBe(false)

    // Click the SH tab
    const shTab = within(container).getByText(/^SH/)
    shTab.click()

    // After re-render: SH panel active, BJ panel hidden
    const panelsAfter = container.querySelectorAll('.gm-sp-panel')
    expect(panelsAfter[0]!.classList.contains('gm-sp-panel-active')).toBe(false)
    expect(panelsAfter[1]!.classList.contains('gm-sp-panel-active')).toBe(true)
  })
})
