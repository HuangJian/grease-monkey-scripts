import type { Runtime } from '../../runtime'
import { fetchAirQuality } from './air-quality'
import { requestJson, requestText } from './http'
import { parseWeather } from './parser'
import { parseCmaNow, parseCmaPage } from './cma'
import { FORECAST_DAYS } from './constants'
import type { WeatherCity, WeatherCityData, WeatherCityEntry } from './types'

export { buildAirQualityUrl, fetchAirQuality, parseAirQuality } from './air-quality'
export { parseWeather } from './parser'
export { requestJson, requestText } from './http'

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
    headers: { Referer: `https://weather.cma.cn/web/weather/${stationId}.html` },
  })
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

async function fetchCmaCity(runtime: Runtime, city: WeatherCity): Promise<WeatherCityData> {
  const stationId = city.cmaStationId!
  console.debug('[gm-dashboard] cma.fetchCmaCity: station', stationId, 'city', city.cityLabel)
  const [om, pageHtml, nowJson] = await Promise.allSettled([
    fetchOpenMeteoBase(runtime, city.latitude, city.longitude),
    fetchCmaPageHtml(runtime, stationId),
    fetchCmaNowJson(runtime, stationId),
  ])

  console.debug(
    '[gm-dashboard] cma.fetchCmaCity: om',
    om.status,
    'page',
    pageHtml.status,
    'now',
    nowJson.status,
  )
  if (pageHtml.status === 'fulfilled') {
    console.debug('[gm-dashboard] cma.fetchCmaCity: page length', pageHtml.value.length)
  } else {
    console.debug('[gm-dashboard] cma.fetchCmaCity: page error', pageHtml.reason)
  }
  if (nowJson.status === 'fulfilled') {
    console.debug(
      '[gm-dashboard] cma.fetchCmaCity: now body sample',
      JSON.stringify(nowJson.value).slice(0, 200),
    )
  } else {
    console.debug('[gm-dashboard] cma.fetchCmaCity: now error', nowJson.reason)
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
      console.debug('[gm-dashboard] cma.fetchCmaCity: page parse returned null, keeping OM hourly')
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

  console.debug(
    '[gm-dashboard] cma.fetchCmaCity: merged current.source',
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
): Promise<{ entries: WeatherCityEntry[] }> {
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
