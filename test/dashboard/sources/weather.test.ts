import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
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
  },
  daily: {
    time: ['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18'],
    temperature_2m_max: [5.1, 6.4, 4.0, 2.0],
    temperature_2m_min: [-2.0, -1.2, -3.0, -4.0],
    weather_code: [3, 1, 51, 71],
    precipitation_probability_max: [20, 10, 60, 80],
  },
}

const AIR_QUALITY = {
  latitude: 39.9,
  longitude: 116.4,
  current: { us_aqi: 42, pm2_5: 8.1, pm10: 12.3 },
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
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onload({ responseText: JSON.stringify(AIR_QUALITY) }))
    const aq = await fetchAirQuality(runtime, 39.9, 116.4)
    expect(aq.us_aqi).toBe(42)
  })
  test('rejects on bad JSON', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => d.onload({ responseText: 'nope' }))
    await expect(fetchAirQuality(runtime, 39.9, 116.4)).rejects.toThrow()
  })
})

describe('fetchWeather', () => {
  test('resolves with parsed data and air_quality on success', async () => {
    const dom = new JSDOM('<html></html>')
    let i = 0
    const runtime = makeRuntime(dom, (d) => {
      if (i++ === 0) d.onload({ responseText: JSON.stringify(FIXTURE) })
      else d.onload({ responseText: JSON.stringify(AIR_QUALITY) })
    })
    const data = await fetchWeather(runtime, 39.9, 116.4)
    expect(data.current.temperature_2m).toBe(3.4)
    expect(data.current.air_quality?.us_aqi).toBe(42)
  })
  test('still resolves when AQI call fails (air_quality null)', async () => {
    const dom = new JSDOM('<html></html>')
    let i = 0
    const runtime = makeRuntime(dom, (d) => {
      if (i++ === 0) d.onload({ responseText: JSON.stringify(FIXTURE) })
      else d.onerror?.()
    })
    const data = await fetchWeather(runtime, 39.9, 116.4)
    expect(data.current.air_quality).toBeNull()
  })
  test('rejects when weather call fails', async () => {
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
    const runtime = makeRuntime(dom, (d) => {
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
    const dom = new JSDOM('<html></html>')
    const seen: string[] = []
    const runtime = makeRuntime(dom, (d) => {
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
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, () => {})
    await expect(fetchWeatherAll(runtime, [])).rejects.toThrow('no cities')
  })

  test('merges CMA daily + current into Open-Meteo base when cmaStationId is set', async () => {
    const dom = new JSDOM('<html></html>')
    const cmaPageHtml = readFileSync(
      join(import.meta.dir, '..', 'fixtures', 'cma-beijing.html'),
      'utf8',
    )
    const cmaNowJson = readFileSync(join(import.meta.dir, '..', 'fixtures', 'cma-now.json'), 'utf8')
    const runtime = makeRuntime(dom, (d) => {
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
    expect(data.current.air_quality?.us_aqi).toBe(42)
    expect(data.daily.time.length).toBeGreaterThanOrEqual(2)
    expect(data.daily.temperature_2m_max[0]).toBe(28)
    expect(data.hourly.temperature_2m[0]).toBe(28.3)
  })

  test('falls back to Open-Meteo when CMA page HTML fails', async () => {
    const dom = new JSDOM('<html></html>')
    const runtime = makeRuntime(dom, (d) => {
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
})

describe('createWeatherSource.render', () => {
  function containerEl(): HTMLElement {
    const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
    return dom.window.document.getElementById('c')!
  }

  function cardEl(): { card: HTMLElement; title: HTMLElement; body: HTMLElement } {
    const dom = new JSDOM(
      '<html><body><div id="c"><div class="gm-sp-card"><div class="gm-sp-card-title"></div><div class="gm-sp-card-body"></div></div></div></body></html>',
    )
    const card = dom.window.document.querySelector('.gm-sp-card') as HTMLElement
    const title = card.querySelector('.gm-sp-card-title') as HTMLElement
    const body = card.querySelector('.gm-sp-card-body') as HTMLElement
    return { card, title, body }
  }

  function renderAndCustomize(
    source: ReturnType<typeof createWeatherSource>,
    title: HTMLElement,
    body: HTMLElement,
    data: Parameters<typeof source.render>[1],
  ): void {
    source.render(body, data)
    source.customizeHeader!(title, data)
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
            },
            hourly: FIXTURE.hourly,
            daily: FIXTURE.daily,
          },
        },
      ],
    }
  }

  test('renders one tab per city with name, current icon, and current temp', () => {
    const { title, body } = cardEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    const data = buildData().entries[0]!.data
    renderAndCustomize(source, title, body, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data },
        { status: 'ok', cityLabel: 'SH', data },
      ],
    })
    const tabs = title.querySelectorAll('.gm-sp-weather-tab')
    expect(tabs).toHaveLength(2)
    expect(tabs[0]!.textContent).toBe('BJ ☁️ 3°C')
    expect(tabs[1]!.textContent).toBe('SH ☁️ 3°C')
  })

  test('uses -- placeholder for tab when city data is in error state', () => {
    const { title, body } = cardEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    renderAndCustomize(source, title, body, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data: buildData().entries[0]!.data },
        { status: 'error', cityLabel: 'SH', error: 'network error' },
      ],
    })
    const tabs = title.querySelectorAll('.gm-sp-weather-tab')
    expect(tabs[0]!.textContent).toBe('BJ ☁️ 3°C')
    expect(tabs[1]!.textContent).toBe('SH --')
  })

  test('activates the first tab by default and only its panel is visible', () => {
    const { title, body } = cardEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    const data = buildData().entries[0]!.data
    renderAndCustomize(source, title, body, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data },
        { status: 'ok', cityLabel: 'SH', data },
      ],
    })
    const tabs = title.querySelectorAll<HTMLElement>('.gm-sp-weather-tab')
    const panels = body.querySelectorAll<HTMLElement>('.gm-sp-weather-panel')
    expect(tabs[0]!.classList.contains('gm-sp-weather-tab-active')).toBe(true)
    expect(tabs[1]!.classList.contains('gm-sp-weather-tab-active')).toBe(false)
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
    expect(panels[0]!.classList.contains('gm-sp-weather-panel-active')).toBe(true)
    expect(panels[1]!.classList.contains('gm-sp-weather-panel-active')).toBe(false)
  })

  test('clicking a tab activates the corresponding panel', () => {
    const { title, body } = cardEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    const data = buildData().entries[0]!.data
    renderAndCustomize(source, title, body, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data },
        { status: 'ok', cityLabel: 'SH', data },
      ],
    })
    const tabs = title.querySelectorAll<HTMLElement>('.gm-sp-weather-tab')
    const panels = body.querySelectorAll<HTMLElement>('.gm-sp-weather-panel')
    tabs[1]!.click()
    expect(tabs[0]!.classList.contains('gm-sp-weather-tab-active')).toBe(false)
    expect(tabs[1]!.classList.contains('gm-sp-weather-tab-active')).toBe(true)
    expect(panels[0]!.classList.contains('gm-sp-weather-panel-active')).toBe(false)
    expect(panels[1]!.classList.contains('gm-sp-weather-panel-active')).toBe(true)
  })

  test('replaces title text with tabs and renders one city block per panel', () => {
    const { card, title, body } = cardEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    const data = buildData().entries[0]!.data
    renderAndCustomize(source, title, body, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data },
        { status: 'ok', cityLabel: 'SH', data },
      ],
    })
    expect(card.querySelector('.gm-sp-card-title-text')).toBeNull()
    expect(title.querySelectorAll('.gm-sp-weather-tab')).toHaveLength(2)
    const blocks = body.querySelectorAll('.gm-sp-weather-city')
    expect(blocks).toHaveLength(2)
    const activePanel = body.querySelector('.gm-sp-weather-panel-active')!
    expect(activePanel.querySelectorAll('.gm-sp-weather-day').length).toBeGreaterThan(0)
  })

  test('renders an error block for a failed city without dropping the others', () => {
    const { title, body } = cardEl()
    const source = createWeatherSource({
      cities: [
        { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
        { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
      ],
      ttlMinutes: 60,
    })
    renderAndCustomize(source, title, body, {
      entries: [
        { status: 'ok', cityLabel: 'BJ', data: buildData().entries[0]!.data },
        { status: 'error', cityLabel: 'SH', error: 'network error' },
      ],
    })
    const tabs = title.querySelectorAll('.gm-sp-weather-tab')
    expect(tabs[0]!.textContent).toBe('BJ ☁️ 3°C')
    expect(tabs[1]!.textContent).toBe('SH --')
    const errors = body.querySelectorAll('.gm-sp-weather-error')
    expect(errors).toHaveLength(1)
    expect(errors[0]!.textContent).toBe('network error')
    const blocks = body.querySelectorAll('.gm-sp-weather-city')
    expect(blocks[1]!.classList.contains('gm-sp-weather-city-error')).toBe(true)
    expect(blocks[1]!.querySelector('.gm-sp-weather-temp')).toBeNull()
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

  test('renders AQI badge with US AQI value and Chinese level (no AQI prefix)', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    source.render(container, buildData())
    const aqi = container.querySelector('.gm-sp-weather-aqi') as HTMLElement
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
    source.render(container, data)
    expect(container.querySelector('.gm-sp-weather-aqi')!.textContent).toBe('--')
  })

  test('renders single-line summary with range, AQI, and chips', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: '合肥' }],
      ttlMinutes: 60,
    })
    const data = buildData()
    if (data.entries[0]!.status === 'ok') {
      data.entries[0]!.cityLabel = '合肥'
    }
    source.render(container, data)
    const summary = container.querySelector('.gm-sp-weather-summary')!
    expect(summary).not.toBeNull()
    expect(summary.querySelector('.gm-sp-weather-range')!.textContent).toBe('-2°~5°')
    const chips = summary.querySelectorAll('.gm-sp-weather-chip')
    expect(chips).toHaveLength(3)
    expect(chips[0]!.textContent).toBe('🌡️ 0°')
    expect(chips[1]!.textContent!.replace(/\s+/g, ' ').trim()).toBe('↑ 12.5 km/h')
    const arrow = summary.querySelector('.gm-sp-weather-wind-arrow') as HTMLElement
    expect(arrow.style.getPropertyValue('--gm-sp-wind-rot')).toBe('225deg')
    const precipChip = chips[2] as HTMLElement
    expect(precipChip.classList.contains('gm-sp-weather-precip')).toBe(true)
    const precipIcon = precipChip.querySelector('.gm-sp-weather-precip-icon')!
    expect(precipIcon.textContent).toBe('☁️')
    expect(precipChip.textContent!.replace(/\s+/g, ' ').trim()).toBe('☁️ 20%')
    expect(summary.querySelector('.gm-sp-weather-today')).toBeNull()
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
    source.render(container, data)
    const summary = container.querySelector('.gm-sp-weather-summary')!
    const chips = Array.from(summary.querySelectorAll('.gm-sp-weather-chip'))
    const humidityChip = chips.find((c) => c.textContent === '💧 65%')
    expect(humidityChip).not.toBeUndefined()
  })

  test('omits humidity chip when current.humidity is absent', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    source.render(container, buildData())
    const summary = container.querySelector('.gm-sp-weather-summary')!
    const chips = Array.from(summary.querySelectorAll('.gm-sp-weather-chip'))
    expect(chips.some((c) => c.textContent?.startsWith('💧'))).toBe(false)
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
    source.render(container, data)
    const arrow = container.querySelector('.gm-sp-weather-wind-arrow') as HTMLElement
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
    source.render(container, data)
    const arrow = container.querySelector('.gm-sp-weather-wind-arrow') as HTMLElement
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
    source.render(container, data)
    const link = container.querySelector(
      'a.gm-sp-weather-source-inline',
    ) as HTMLAnchorElement | null
    expect(link).not.toBeNull()
    expect(link!.getAttribute('href')).toBe('https://weather.cma.cn/web/weather/54511.html')
    expect(link!.getAttribute('target')).toBe('_blank')
    expect(link!.textContent).toBe('气象局')
    const daily = container.querySelector('.gm-sp-weather-daily')
    expect(daily!.contains(link!)).toBe(true)
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
    source.render(container, data)
    expect(container.querySelector('.gm-sp-weather-source')).toBeNull()
    expect(container.querySelector('.gm-sp-weather-source-inline')).toBeNull()
  })

  test('renders hourly cells only for remaining hours of current day', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    source.render(container, buildData())
    const cells = container.querySelectorAll('.gm-sp-weather-hour')
    // FIXTURE hourly: 3 entries for 2024-01-15 before 14:00 are skipped,
    // 14:00, 15:00, 23:00 remain (3); 2024-01-16 entries are after current day.
    expect(cells).toHaveLength(3)
    const times = Array.from(cells).map(
      (c) => c.querySelector('.gm-sp-weather-hour-time')!.textContent,
    )
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
      }
    }
    source.render(container, data)
    const cells = container.querySelectorAll('.gm-sp-weather-hour')
    const times = Array.from(cells).map(
      (c) => c.querySelector('.gm-sp-weather-hour-time')!.textContent,
    )
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
      }
    }
    source.render(container, data)
    const cells = container.querySelectorAll('.gm-sp-weather-hour')
    expect(cells).toHaveLength(8)
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
      }
    }
    source.render(container, data)
    const cells = container.querySelectorAll('.gm-sp-weather-hour')
    expect(cells).toHaveLength(8)
  })

  test('renders 3 day pills for +1/+2/+3 only (today moved to summary)', () => {
    const container = containerEl()
    const source = createWeatherSource({
      cities: [{ latitude: 0, longitude: 0, cityLabel: 'X' }],
      ttlMinutes: 60,
    })
    source.render(container, buildData())
    const dailySection = container.querySelector('.gm-sp-weather-daily')!
    const days = dailySection.querySelectorAll('.gm-sp-weather-day')
    expect(days).toHaveLength(3)
    const labels = Array.from(days).map(
      (d) => d.querySelector('.gm-sp-weather-day-label')!.textContent,
    )
    expect(labels).toEqual(['+1', '+2', '+3'])
    const precips = Array.from(days).map(
      (d) => d.querySelector('.gm-sp-weather-day-precip')!.textContent,
    )
    expect(precips).toEqual(['10%', '60%', '80%'])
  })
})
