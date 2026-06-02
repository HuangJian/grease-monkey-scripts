import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import type { Source } from './types'

export type WeatherCurrent = {
  time: string
  temperature_2m: number
  weather_code: number
}

export type WeatherDaily = {
  time: string[]
  temperature_2m_max: number[]
  temperature_2m_min: number[]
  weather_code: number[]
}

export type WeatherData = {
  current: WeatherCurrent
  daily: WeatherDaily
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

export type WeatherSourceOptions = {
  latitude: number
  longitude: number
  cityLabel: string
  ttlMinutes: number
}

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  return {
    id: 'weather',
    title: '天气',
    ttlMs: options.ttlMinutes * 60_000,
    fetch(runtime) {
      return fetchWeather(runtime, options.latitude, options.longitude)
    },
    render(container, data) {
      renderWeather(container, data, options.cityLabel)
    },
  }
}

export function buildWeatherUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: 'temperature_2m,weather_code',
    daily: 'temperature_2m_max,temperature_2m_min,weather_code',
    timezone: 'auto',
    forecast_days: '2',
  })
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`
}

export function fetchWeather(
  runtime: Runtime,
  latitude: number,
  longitude: number,
): Promise<WeatherData> {
  return new Promise<WeatherData>((resolve, reject) => {
    runtime.request({
      url: buildWeatherUrl(latitude, longitude),
      method: 'GET',
      timeout: 15000,
      onload(response) {
        try {
          const json = JSON.parse(response.responseText) as unknown
          const data = parseWeather(json)
          if (!data) reject(new Error('invalid weather response'))
          else resolve(data)
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

export function parseWeather(json: unknown): WeatherData | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  const current = obj.current as Record<string, unknown> | undefined
  const daily = obj.daily as Record<string, unknown> | undefined
  if (!current || !daily) return null
  if (
    typeof current.temperature_2m !== 'number' ||
    typeof current.weather_code !== 'number' ||
    typeof current.time !== 'string'
  ) {
    return null
  }
  if (
    !Array.isArray(daily.time) ||
    !Array.isArray(daily.temperature_2m_max) ||
    !Array.isArray(daily.temperature_2m_min) ||
    !Array.isArray(daily.weather_code)
  ) {
    return null
  }
  return {
    current: {
      time: current.time,
      temperature_2m: current.temperature_2m,
      weather_code: current.weather_code,
    },
    daily: {
      time: daily.time as string[],
      temperature_2m_max: daily.temperature_2m_max as number[],
      temperature_2m_min: daily.temperature_2m_min as number[],
      weather_code: daily.weather_code as number[],
    },
  }
}

function renderWeather(container: HTMLElement, data: WeatherData | null, cityLabel: string): void {
  const document = container.ownerDocument
  container.replaceChildren()
  const wrap = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather">
      <div class="gm-sp-weather-city"></div>
      <div class="gm-sp-weather-current">
        <span class="gm-sp-weather-icon"></span>
        <span class="gm-sp-weather-temp"></span>
      </div>
      <div class="gm-sp-weather-daily"></div>
    </div>`,
  )
  wrap.querySelector('.gm-sp-weather-city')!.textContent = cityLabel
  if (!data) {
    wrap.querySelector('.gm-sp-weather-temp')!.textContent = '--'
    container.appendChild(wrap)
    return
  }
  wrap.querySelector('.gm-sp-weather-icon')!.textContent = weatherCodeIcon(
    data.current.weather_code,
  )
  wrap.querySelector('.gm-sp-weather-temp')!.textContent =
    `${Math.round(data.current.temperature_2m)}°C`
  const dailyEl = wrap.querySelector('.gm-sp-weather-daily')!
  dailyEl.replaceChildren()
  for (let i = 0; i < data.daily.time.length; i++) {
    const max = data.daily.temperature_2m_max[i]
    const min = data.daily.temperature_2m_min[i]
    const code = data.daily.weather_code[i]
    const label = i === 0 ? '今日' : '明日'
    const day = htmlToElement<HTMLDivElement>(
      document,
      `<div class="gm-sp-weather-day">
        <span class="gm-sp-weather-day-label"></span>
        <span class="gm-sp-weather-day-icon"></span>
        <span class="gm-sp-weather-day-temp"></span>
      </div>`,
    )
    day.querySelector('.gm-sp-weather-day-label')!.textContent = label
    day.querySelector('.gm-sp-weather-day-icon')!.textContent = weatherCodeIcon(code)
    day.querySelector('.gm-sp-weather-day-temp')!.textContent =
      `${Math.round(min)}° / ${Math.round(max)}°`
    dailyEl.appendChild(day)
  }
  container.appendChild(wrap)
}
