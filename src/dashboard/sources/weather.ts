import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import type { WeatherCity } from '../types'
import type { Source } from './types'
import { createWeatherEditor } from './weatherEditor'

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

export type WeatherCityData = {
  current: WeatherCurrent
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

export type WeatherSourceOptions = {
  cities: WeatherCity[]
  ttlMinutes: number
}

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  return {
    id: 'weather',
    title: '天气',
    ttlMs: options.ttlMinutes * 60_000,
    fetch(runtime) {
      return fetchWeatherAll(runtime, options.cities)
    },
    render(container, data) {
      renderWeather(container, data)
    },
    createEditor() {
      return createWeatherEditor({
        cities: options.cities,
        ttlMinutes: options.ttlMinutes,
      })
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
): Promise<WeatherCityData> {
  return new Promise<WeatherCityData>((resolve, reject) => {
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
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const block = htmlToElement<HTMLDivElement>(
      document,
      `<div class="gm-sp-weather-city">
        <div class="gm-sp-weather-city-label"></div>
        <div class="gm-sp-weather-current">
          <span class="gm-sp-weather-icon"></span>
          <span class="gm-sp-weather-temp"></span>
        </div>
        <div class="gm-sp-weather-daily"></div>
      </div>`,
    )
    block.querySelector('.gm-sp-weather-city-label')!.textContent = entry.cityLabel
    if (entry.status === 'error') {
      block.querySelector('.gm-sp-weather-temp')!.textContent = '--'
      const err = htmlToElement<HTMLDivElement>(document, '<div class="gm-sp-weather-error"></div>')
      err.textContent = entry.error
      block.appendChild(err)
    } else {
      block.querySelector('.gm-sp-weather-icon')!.textContent = weatherCodeIcon(
        entry.data.current.weather_code,
      )
      block.querySelector('.gm-sp-weather-temp')!.textContent =
        `${Math.round(entry.data.current.temperature_2m)}°C`
      const dailyEl = block.querySelector('.gm-sp-weather-daily')!
      dailyEl.replaceChildren()
      for (let j = 0; j < entry.data.daily.time.length; j++) {
        const max = entry.data.daily.temperature_2m_max[j]
        const min = entry.data.daily.temperature_2m_min[j]
        const code = entry.data.daily.weather_code[j]
        const label = j === 0 ? '今日' : '明日'
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
    }
    wrap.appendChild(block)
  }
  container.appendChild(wrap)
}
