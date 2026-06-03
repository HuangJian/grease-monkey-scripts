import type { Runtime } from '../../runtime'
import type { WeatherCity } from './types'
import type { WeatherAirQuality, WeatherCityData } from './types'
import { parseCmaNow, parseCmaPage } from './cma'
import { FORECAST_DAYS } from './constants'

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

function requestText(
  runtime: Runtime,
  url: string,
  headers?: Record<string, string>,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: 15000,
      headers,
      onload(response) {
        resolve(response.responseText)
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
  return fetchOpenMeteoBase(runtime, latitude, longitude)
}

async function fetchOpenMeteoBase(
  runtime: Runtime,
  latitude: number,
  longitude: number,
): Promise<WeatherCityData> {
  const data = await requestJson(runtime, buildWeatherUrl(latitude, longitude)).then((json) => {
    const parsed = parseWeather(json)
    if (!parsed) throw new Error('invalid weather response')
    return parsed
  })
  try {
    data.current.air_quality = await fetchAirQuality(runtime, latitude, longitude)
  } catch {
    data.current.air_quality = null
  }
  return data
}

async function fetchCmaPageHtml(runtime: Runtime, stationId: string): Promise<string> {
  return requestText(runtime, `https://weather.cma.cn/web/weather/${stationId}.html`)
}

async function fetchCmaNowJson(runtime: Runtime, stationId: string): Promise<unknown> {
  const url = `https://weather.cma.cn/api/now/${stationId}`
  const text = await requestText(runtime, url, {
    Referer: `https://weather.cma.cn/web/weather/${stationId}.html`,
  })
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

async function fetchCmaCity(runtime: Runtime, city: WeatherCity): Promise<WeatherCityData> {
  const stationId = city.cmaStationId!
  console.log('[cma] fetchCmaCity: station', stationId, 'city', city.cityLabel)
  const [om, pageHtml, nowJson] = await Promise.allSettled([
    fetchOpenMeteoBase(runtime, city.latitude, city.longitude),
    fetchCmaPageHtml(runtime, stationId),
    fetchCmaNowJson(runtime, stationId),
  ])

  console.log('[cma] fetchCmaCity: om', om.status, 'page', pageHtml.status, 'now', nowJson.status)
  if (pageHtml.status === 'fulfilled') {
    console.log('[cma] fetchCmaCity: page length', pageHtml.value.length)
  } else {
    console.log('[cma] fetchCmaCity: page error', pageHtml.reason)
  }
  if (nowJson.status === 'fulfilled') {
    console.log('[cma] fetchCmaCity: now body sample', JSON.stringify(nowJson.value).slice(0, 200))
  } else {
    console.log('[cma] fetchCmaCity: now error', nowJson.reason)
  }

  if (om.status !== 'fulfilled') {
    throw new Error(om.reason instanceof Error ? om.reason.message : 'open-meteo failed')
  }
  const data = om.value

  if (pageHtml.status === 'fulfilled') {
    const parsed = parseCmaPage(pageHtml.value, runtime.DOMParser)
    if (parsed) {
      data.cmaUrl = `https://weather.cma.cn/web/weather/${stationId}.html`
      data.daily = parsed.daily
      const omByHour = new Map<number, number>()
      for (let i = 0; i < data.hourly.time.length; i++) {
        const h = parseInt(data.hourly.time[i]!.slice(11, 13), 10)
        if (!omByHour.has(h)) omByHour.set(h, i)
      }
      const precipProb: number[] = parsed.hourly.time.map((t) => {
        const h = parseInt(t.slice(11, 13), 10)
        const idx = omByHour.get(h)
        return idx != null ? (data.hourly.precipitation_probability[idx] ?? 0) : 0
      })
      data.hourly = {
        time: parsed.hourly.time,
        temperature_2m: parsed.hourly.temperature_2m,
        weather_code: parsed.hourly.weather_code,
        precipitation_probability: precipProb,
        pressure: parsed.hourly.pressure,
        humidity: parsed.hourly.humidity,
        cloud_cover: parsed.hourly.cloud_cover,
        precipitation_amount: parsed.hourly.precipitation_amount,
      }
    } else {
      console.log('[cma] fetchCmaCity: page parse returned null, keeping OM hourly')
    }
  }

  if (nowJson.status === 'fulfilled') {
    const nowParsed = parseCmaNow(nowJson.value)
    if (nowParsed) {
      data.current = {
        ...data.current,
        time: nowParsed.current.time,
        temperature_2m: nowParsed.current.temperature_2m,
        wind_speed_10m: nowParsed.current.wind_speed_10m,
        wind_direction_10m: nowParsed.current.wind_direction_10m,
        humidity: nowParsed.current.humidity,
        pressure: nowParsed.current.pressure,
        precipitation: nowParsed.current.precipitation,
        source: 'cma',
      }
    }
  }

  console.log(
    '[cma] fetchCmaCity: merged current.source',
    data.current.source,
    'current.time',
    data.current.time,
    'hourly times',
    data.hourly.time.slice(0, 4),
  )
  return data
}

export async function fetchWeatherAll(
  runtime: Runtime,
  cities: WeatherCity[],
): Promise<{ entries: import('./types').WeatherCityEntry[] }> {
  if (cities.length === 0) {
    throw new Error('weather: no cities configured')
  }
  const settled = await Promise.allSettled(
    cities.map((city) =>
      city.cmaStationId
        ? fetchCmaCity(runtime, city)
        : fetchWeather(runtime, city.latitude, city.longitude),
    ),
  )
  const entries = settled.map((s, i) => {
    const cityLabel = cities[i]!.cityLabel
    if (s.status === 'fulfilled') {
      return { status: 'ok' as const, cityLabel, data: s.value }
    }
    return {
      status: 'error' as const,
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
      source: 'open-meteo',
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
