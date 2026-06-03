import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import type { WeatherCity } from '../types'
import type { Source } from './types'
import { createWeatherEditor } from './weatherEditor'

export type WeatherCurrent = {
  time: string
  temperature_2m: number
  apparent_temperature: number
  weather_code: number
  wind_speed_10m: number
  wind_direction_10m: number
  air_quality: WeatherAirQuality | null
}

export type WeatherAirQuality = {
  us_aqi: number
  pm2_5: number
  pm10: number
}

export type WeatherHourly = {
  time: string[]
  temperature_2m: number[]
  weather_code: number[]
  precipitation_probability: number[]
}

export type WeatherDaily = {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  weather_code: number[]
  precipitation_probability_max: number[]
}

export type WeatherCityData = {
  current: WeatherCurrent
  hourly: WeatherHourly
  daily: WeatherDaily
}

export type WeatherCityEntry =
  | { status: 'ok'; cityLabel: string; data: WeatherCityData }
  | { status: 'error'; cityLabel: string; error: string }

export type WeatherData = {
  entries: WeatherCityEntry[]
}

const WEATHER_CODE_ICON: Record<number, string> = {
  0: '☀️',
  1: '🌤',
  2: '⛅',
  3: '☁️',
  45: '🌫',
  48: '🌫',
  51: '🌦',
  53: '🌦',
  55: '🌧',
  56: '🌧',
  57: '🌧',
  61: '🌧',
  63: '🌧',
  65: '🌧',
  66: '🌧',
  67: '🌧',
  71: '🌨',
  73: '🌨',
  75: '🌨',
  77: '🌨',
  80: '🌦',
  81: '🌧',
  82: '🌧',
  85: '🌨',
  86: '🌨',
  95: '⛈',
  96: '⛈',
  99: '⛈',
}

export function weatherCodeIcon(code: number): string {
  return WEATHER_CODE_ICON[code] ?? '🌡'
}

export type AqiLevel = {
  label: string
  color: string
}

const AQI_LEVELS: Array<{ max: number; level: AqiLevel }> = [
  { max: 50, level: { label: '优', color: '#10b981' } },
  { max: 100, level: { label: '良', color: '#eab308' } },
  { max: 150, level: { label: '轻污染', color: '#f97316' } },
  { max: 200, level: { label: '中污染', color: '#ef4444' } },
  { max: 300, level: { label: '重污染', color: '#a855f7' } },
  { max: 500, level: { label: '严重', color: '#7f1d1d' } },
]

export function aqiLevel(aqi: number | null | undefined): AqiLevel {
  if (aqi == null || !Number.isFinite(aqi)) return { label: '--', color: '#9ca3af' }
  for (const entry of AQI_LEVELS) {
    if (aqi <= entry.max) return entry.level
  }
  return AQI_LEVELS[AQI_LEVELS.length - 1]!.level
}

export function windDirectionArrow(deg: number): string {
  if (!Number.isFinite(deg)) return '·'
  return '↑'
}

export function formatHourLabel(iso: string): string {
  const m = iso.match(/T(\d{2})/)
  return m ? `${m[1]}:00` : iso
}

export type WeatherSourceOptions = {
  cities: WeatherCity[]
  ttlMinutes: number
}

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  return {
    id: 'weather',
    title: '天气',
    ttlMs: options.ttlMinutes * 60_000,
    placement: 'side',
    fetch(runtime) {
      return fetchWeatherAll(runtime, options.cities)
    },
    render(container, data) {
      renderWeather(container, data)
    },
    customizeHeader(titleContainer, data) {
      customizeWeatherHeader(titleContainer, data)
    },
    createEditor() {
      return createWeatherEditor({
        cities: options.cities,
        ttlMinutes: options.ttlMinutes,
      })
    },
  }
}

export const FORECAST_DAYS = 4

export function buildWeatherUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    timezone: 'auto',
    forecast_days: FORECAST_DAYS.toString(),
  })
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
}

export function buildAirQualityUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: 'us_aqi,pm2_5,pm10',
    timezone: 'auto',
  })
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`
}

function requestJson(runtime: Runtime, url: string): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: 15000,
      onload(response) {
        try {
          resolve(JSON.parse(response.responseText) as unknown)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

export function parseAirQuality(json: unknown): WeatherAirQuality | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  const current = obj.current as Record<string, unknown> | undefined
  if (!current) return null
  if (typeof current.us_aqi !== 'number') return null
  return {
    us_aqi: current.us_aqi,
    pm2_5: typeof current.pm2_5 === 'number' ? current.pm2_5 : 0,
    pm10: typeof current.pm10 === 'number' ? current.pm10 : 0,
  }
}

export function fetchAirQuality(
  runtime: Runtime,
  latitude: number,
  longitude: number,
): Promise<WeatherAirQuality> {
  return requestJson(runtime, buildAirQualityUrl(latitude, longitude)).then((json) => {
    const aq = parseAirQuality(json)
    if (!aq) throw new Error('invalid air quality response')
    return aq
  })
}

export function fetchWeather(
  runtime: Runtime,
  latitude: number,
  longitude: number,
): Promise<WeatherCityData> {
  return requestJson(runtime, buildWeatherUrl(latitude, longitude)).then(async (json) => {
    const data = parseWeather(json)
    if (!data) throw new Error('invalid weather response')
    try {
      const aq = await fetchAirQuality(runtime, latitude, longitude)
      data.current.air_quality = aq
    } catch {
      data.current.air_quality = null
    }
    return data
  })
}

export async function fetchWeatherAll(
  runtime: Runtime,
  cities: WeatherCity[],
): Promise<WeatherData> {
  if (cities.length === 0) {
    throw new Error('weather: no cities configured')
  }
  const settled = await Promise.allSettled(
    cities.map((city) => fetchWeather(runtime, city.latitude, city.longitude)),
  )
  const entries: WeatherCityEntry[] = settled.map((s, i) => {
    const cityLabel = cities[i].cityLabel
    if (s.status === 'fulfilled') {
      return { status: 'ok', cityLabel, data: s.value }
    }
    return {
      status: 'error',
      cityLabel,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
    }
  })
  return { entries }
}

export function parseWeather(json: unknown): WeatherCityData | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  const current = obj.current as Record<string, unknown> | undefined
  const daily = obj.daily as Record<string, unknown> | undefined
  const hourly = obj.hourly as Record<string, unknown> | undefined
  if (!current || !daily || !hourly) return null
  if (
    typeof current.temperature_2m !== 'number' ||
    typeof current.apparent_temperature !== 'number' ||
    typeof current.weather_code !== 'number' ||
    typeof current.wind_speed_10m !== 'number' ||
    typeof current.wind_direction_10m !== 'number' ||
    typeof current.time !== 'string'
  ) {
    return null
  }
  if (
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.temperature_2m_min) ||
    !Array.isArray(daily.weather_code) ||
    !Array.isArray(daily.precipitation_probability_max)
  ) {
    return null
  }
  if (
    !Array.isArray(hourly.time) ||
    !Array.isArray(hourly.temperature_2m) ||
    !Array.isArray(hourly.weather_code) ||
    !Array.isArray(hourly.precipitation_probability)
  ) {
    return null
  }
  return {
    current: {
      time: current.time,
      temperature_2m: current.temperature_2m,
      apparent_temperature: current.apparent_temperature,
      weather_code: current.weather_code,
      wind_speed_10m: current.wind_speed_10m,
      wind_direction_10m: current.wind_direction_10m,
      air_quality: null,
    },
    hourly: {
      time: hourly.time as string[],
      temperature_2m: hourly.temperature_2m as number[],
      weather_code: hourly.weather_code as number[],
      precipitation_probability: hourly.precipitation_probability as number[],
    },
    daily: {
      time: daily.time as string[],
      temperature_2m_max: daily.temperature_2m_max as number[],
      temperature_2m_min: daily.temperature_2m_min as number[],
      weather_code: daily.weather_code as number[],
      precipitation_probability_max: daily.precipitation_probability_max as number[],
    },
  }
}

function remainingTodayHours(hourly: WeatherHourly, currentTime: string): number[] {
  const out: number[] = []
  for (let i = 0; i < hourly.time.length; i++) {
    const t = hourly.time[i]!
    if (t < currentTime) continue
    if (t.slice(0, 10) !== currentTime.slice(0, 10)) break
    out.push(i)
  }
  return out
}

function buildCityBlock(document: Document, data: WeatherCityData): HTMLElement {
  const block = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather-city">
      <div class="gm-sp-weather-summary"></div>
      <div class="gm-sp-weather-hourly"></div>
      <div class="gm-sp-weather-daily"></div>
    </div>`,
  )

  const summary = block.querySelector('.gm-sp-weather-summary')!
  if (data.daily.time.length > 0) {
    const min0 = data.daily.temperature_2m_min[0]!
    const max0 = data.daily.temperature_2m_max[0]!
    const rangeEl = htmlToElement<HTMLSpanElement>(
      document,
      `<span class="gm-sp-weather-range"></span>`,
    )
    rangeEl.textContent = `${Math.round(min0)}°~${Math.round(max0)}°`
    summary.appendChild(rangeEl)
  }

  const apparentEl = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-chip"></span>`,
  )
  apparentEl.textContent = `体感 ${Math.round(data.current.apparent_temperature)}°`
  summary.appendChild(apparentEl)

  const aqiEl = htmlToElement<HTMLSpanElement>(document, `<span class="gm-sp-weather-aqi"></span>`)
  const aq = data.current.air_quality
  const level = aqiLevel(aq?.us_aqi ?? null)
  aqiEl.dataset['level'] = level.label
  aqiEl.style.setProperty('--gm-sp-aqi-color', level.color)
  aqiEl.textContent = aq ? `${aq.us_aqi} ${level.label}` : '--'
  summary.appendChild(aqiEl)

  const windArrow = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-wind-arrow"></span>`,
  )
  windArrow.textContent = windDirectionArrow(data.current.wind_direction_10m)
  windArrow.style.setProperty(
    '--gm-sp-wind-rot',
    `${Math.round(data.current.wind_direction_10m)}deg`,
  )
  const windEl = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-chip gm-sp-weather-wind"></span>`,
  )
  windEl.appendChild(windArrow)
  windEl.appendChild(document.createTextNode(` ${data.current.wind_speed_10m.toFixed(1)} km/h`))
  summary.appendChild(windEl)

  const precipMax = data.daily.precipitation_probability_max[0] ?? 0
  const precipEl = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-chip gm-sp-weather-precip"></span>`,
  )
  if (data.daily.weather_code[0] != null) {
    const precipIcon = htmlToElement<HTMLSpanElement>(
      document,
      `<span class="gm-sp-weather-precip-icon"></span>`,
    )
    precipIcon.textContent = weatherCodeIcon(data.daily.weather_code[0]!)
    precipEl.appendChild(precipIcon)
    precipEl.appendChild(document.createTextNode(` ${precipMax}%`))
  } else {
    precipEl.textContent = `降水 ${precipMax}%`
  }
  summary.appendChild(precipEl)

  const hourlyEl = block.querySelector('.gm-sp-weather-hourly')!
  hourlyEl.replaceChildren()
  const indices = remainingTodayHours(data.hourly, data.current.time)
  if (indices.length === 0) {
    hourlyEl.appendChild(
      htmlToElement<HTMLDivElement>(
        document,
        '<div class="gm-sp-weather-hourly-empty">无小时数据</div>',
      ),
    )
  } else {
    for (const i of indices) {
      const cell = htmlToElement<HTMLDivElement>(
        document,
        `<div class="gm-sp-weather-hour">
          <span class="gm-sp-weather-hour-time"></span>
          <span class="gm-sp-weather-hour-icon"></span>
          <span class="gm-sp-weather-hour-temp"></span>
          <span class="gm-sp-weather-hour-precip"></span>
        </div>`,
      )
      cell.querySelector('.gm-sp-weather-hour-time')!.textContent = formatHourLabel(
        data.hourly.time[i]!,
      )
      cell.querySelector('.gm-sp-weather-hour-icon')!.textContent = weatherCodeIcon(
        data.hourly.weather_code[i]!,
      )
      cell.querySelector('.gm-sp-weather-hour-temp')!.textContent =
        `${Math.round(data.hourly.temperature_2m[i]!)}°`
      cell.querySelector('.gm-sp-weather-hour-precip')!.textContent =
        `${data.hourly.precipitation_probability[i] ?? 0}%`
      hourlyEl.appendChild(cell)
    }
  }

  const dailyEl = block.querySelector('.gm-sp-weather-daily')!
  dailyEl.replaceChildren()
  for (let j = 1; j < data.daily.time.length; j++) {
    const max = data.daily.temperature_2m_max[j]!
    const min = data.daily.temperature_2m_min[j]!
    const code = data.daily.weather_code[j]!
    const precip = data.daily.precipitation_probability_max[j] ?? 0
    const label = `+${j}`
    const day = htmlToElement<HTMLDivElement>(
      document,
      `<div class="gm-sp-weather-day">
        <span class="gm-sp-weather-day-label"></span>
        <span class="gm-sp-weather-day-icon"></span>
        <span class="gm-sp-weather-day-temp"></span>
        <span class="gm-sp-weather-day-precip"></span>
      </div>`,
    )
    day.querySelector('.gm-sp-weather-day-label')!.textContent = label
    day.querySelector('.gm-sp-weather-day-icon')!.textContent = weatherCodeIcon(code)
    day.querySelector('.gm-sp-weather-day-temp')!.textContent =
      `${Math.round(min)}° / ${Math.round(max)}°`
    day.querySelector('.gm-sp-weather-day-precip')!.textContent = `${precip}%`
    dailyEl.appendChild(day)
  }

  return block
}

function buildErrorBlock(document: Document, error: string): HTMLElement {
  const block = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather-city gm-sp-weather-city-error">
      <div class="gm-sp-weather-error"></div>
    </div>`,
  )
  block.querySelector('.gm-sp-weather-error')!.textContent = error
  return block
}

function tabLabelFor(entry: WeatherCityEntry): string {
  if (entry.status === 'ok') {
    const icon = weatherCodeIcon(entry.data.current.weather_code)
    const temp = `${Math.round(entry.data.current.temperature_2m)}°C`
    return `${entry.cityLabel} ${icon} ${temp}`
  }
  return `${entry.cityLabel} --`
}

function setActivePanel(panels: HTMLElement, index: number): void {
  const panelEls = panels.querySelectorAll<HTMLElement>('.gm-sp-weather-panel')
  panelEls.forEach((panel, i) => {
    panel.classList.toggle('gm-sp-weather-panel-active', i === index)
  })
}

function activateTab(tabs: HTMLElement, panels: HTMLElement, index: number): void {
  const tabEls = tabs.querySelectorAll<HTMLElement>('.gm-sp-weather-tab')
  tabEls.forEach((tab, i) => {
    tab.classList.toggle('gm-sp-weather-tab-active', i === index)
    tab.setAttribute('aria-selected', i === index ? 'true' : 'false')
  })
  setActivePanel(panels, index)
}

function renderWeather(container: HTMLElement, data: WeatherData | null): void {
  const document = container.ownerDocument
  container.replaceChildren()
  const wrap = htmlToElement<HTMLDivElement>(document, `<div class="gm-sp-weather"></div>`)
  const entries = data?.entries ?? []
  if (entries.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(
      document,
      '<div class="gm-sp-weather-empty">--</div>',
    )
    wrap.appendChild(empty)
    container.appendChild(wrap)
    return
  }

  const panels = htmlToElement<HTMLDivElement>(document, `<div class="gm-sp-weather-panels"></div>`)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const panel = htmlToElement<HTMLDivElement>(
      document,
      `<div class="gm-sp-weather-panel" role="tabpanel"></div>`,
    )
    if (entry.status === 'ok') {
      panel.appendChild(buildCityBlock(document, entry.data))
    } else {
      panel.appendChild(buildErrorBlock(document, entry.error))
    }
    panels.appendChild(panel)
  }

  wrap.appendChild(panels)
  container.appendChild(wrap)
  setActivePanel(panels, 0)
}

function customizeWeatherHeader(titleContainer: HTMLElement, data: WeatherData | null): void {
  const document = titleContainer.ownerDocument
  const entries = data?.entries ?? []
  titleContainer.replaceChildren()
  if (entries.length === 0) {
    titleContainer.textContent = '天气'
    return
  }
  const tabs = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather-tabs" role="tablist"></div>`,
  )
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const tab = htmlToElement<HTMLButtonElement>(
      document,
      `<button type="button" class="gm-sp-weather-tab" role="tab" aria-selected="false"></button>`,
    )
    tab.textContent = tabLabelFor(entry)
    tab.addEventListener('click', () => {
      const cardRoot = tabs.closest('.gm-sp-card')
      const panelsContainer = cardRoot?.querySelector('.gm-sp-weather-panels')
      if (panelsContainer) activateTab(tabs, panelsContainer as HTMLElement, i)
    })
    tabs.appendChild(tab)
  }
  titleContainer.appendChild(tabs)
  const cardRoot = titleContainer.closest('.gm-sp-card')
  const panelsContainer = cardRoot?.querySelector('.gm-sp-weather-panels')
  if (panelsContainer) activateTab(tabs, panelsContainer as HTMLElement, 0)
}
