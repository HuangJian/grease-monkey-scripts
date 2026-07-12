/**
 * Weather data fetcher.
 *
 * Fetches weather data from Open-Meteo API and CMA (China Meteorological
 * Administration) page. CMA provides higher-precision current conditions
 * and hourly precipitation; Open-Meteo provides air quality and fallback.
 *
 * Test script: scripts/fetchers/verify-cma.ts
 *   Run: bun scripts/fetchers/verify-cma.ts [stationId]
 *   Fetches live CMA page + now JSON and prints parsed daily/hourly precipitation.
 */
import type { Runtime } from '../../runtime'
import { fetchAirQuality } from './air-quality'
import { requestJson, requestTextWithHeaders } from './http'
import { parseWeather } from './parser'
import { parseCmaNow } from './cma/parse-now'
import { parseCmaPage } from './cma/parse-page'
import {
  isSafelineChallenge,
  parseSafelineChallenge,
  solveSafelinePow,
  extractSafelineCookie,
  buildSafelineCookieHeader,
} from './cma/safeline'
import { FORECAST_DAYS } from './constants'
import type { WeatherCity, WeatherCityData, WeatherCityEntry } from './types'

export { buildAirQualityUrl, fetchAirQuality, parseAirQuality } from './air-quality'
export { parseWeather } from './parser'
export { requestJson, requestText, requestTextWithHeaders } from './http'

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

/**
 * Fetch a CMA URL, transparently solving SafeLine WAF challenges.
 *
 * If the first response is a WAF challenge page, this solves the proof-of-work
 * and retries with the required cookies. If the retry also fails, the original
 * (challenge) response is returned so the parser can handle it gracefully.
 */
async function fetchCmaTextWithWaf(
  runtime: Runtime,
  url: string,
  options: { headers?: Record<string, string> } = {},
): Promise<string> {
  const { text, headers } = await requestTextWithHeaders(runtime, url, options)

  if (!isSafelineChallenge(text)) return text

  const challenge = parseSafelineChallenge(text)
  if (!challenge) {
    console.warn('[gm-dashboard] cma.waf: challenge detected but could not parse')
    return text
  }

  const cookie = extractSafelineCookie(headers)
  if (!cookie) {
    console.warn('[gm-dashboard] cma.waf: challenge detected but no safeline_bot_challenge cookie')
    return text
  }

  console.debug('[gm-dashboard] cma.waf: solving PoW', challenge)
  const suffix = solveSafelinePow(challenge.prefix, challenge.leadingZeroBits)
  console.debug('[gm-dashboard] cma.waf: PoW solved, suffix', suffix)

  const { text: retryText } = await requestTextWithHeaders(runtime, url, {
    ...options,
    headers: {
      ...options.headers,
      Cookie: buildSafelineCookieHeader(cookie, suffix),
    },
  })

  if (isSafelineChallenge(retryText)) {
    console.warn('[gm-dashboard] cma.waf: retry still returned challenge, giving up')
  }
  return retryText
}

async function fetchCmaPageHtml(runtime: Runtime, stationId: string): Promise<string> {
  return fetchCmaTextWithWaf(runtime, `https://weather.cma.cn/web/weather/${stationId}.html`)
}

async function fetchCmaNowJson(runtime: Runtime, stationId: string): Promise<unknown> {
  const url = `https://weather.cma.cn/api/now/${stationId}`
  const text = await fetchCmaTextWithWaf(runtime, url, {
    headers: { Referer: `https://weather.cma.cn/web/weather/${stationId}.html` },
  })
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

async function fetchCmaCity(runtime: Runtime, city: WeatherCity): Promise<WeatherCityData> {
  const stationId = city.cmaStationId
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

  const cmaUrl = `https://weather.cma.cn/web/weather/${stationId}.html`
  let cmaPageOk = false
  let cmaNowOk = false

  if (pageHtml.status === 'fulfilled') {
    const parsed = parseCmaPage(pageHtml.value, runtime.DOMParser)
    if (parsed) {
      data.daily = parsed.daily
      cmaPageOk = true

      if (parsed.hourly) {
        const omByHour = new Map<number, number>()
        data.hourly.time.forEach((t, i) => {
          const h = parseInt(t.slice(11, 13), 10)
          if (!omByHour.has(h)) omByHour.set(h, i)
        })
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
          wind_speed_10m: parsed.hourly.wind_speed_10m,
          wind_direction_10m: parsed.hourly.wind_direction_10m,
        }
      } else {
        console.debug(
          '[gm-dashboard] cma.fetchCmaCity: page has daily but no hourly, keeping OM hourly',
        )
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
        humidity: nowParsed.current.humidity,
        pressure: nowParsed.current.pressure,
        precipitation: nowParsed.current.precipitation,
        source: 'cma',
      }
      cmaNowOk = true
    }
  }

  const pageWindMs = data.hourly.wind_speed_10m[0]
  if (typeof pageWindMs === 'number' && Number.isFinite(pageWindMs)) {
    data.current.wind_speed_10m = pageWindMs * 3.6
  }
  const pageWindDir = data.hourly.wind_direction_10m[0]
  if (typeof pageWindDir === 'number' && Number.isFinite(pageWindDir)) {
    data.current.wind_direction_10m = pageWindDir
  }

  data.cmaUrl = cmaUrl
  data.cmaFailed = !cmaPageOk || !cmaNowOk
  if (!data.cmaFailed) {
    data.cmaFetchedAt = Date.now()
  }

  console.debug(
    '[gm-dashboard] cma.fetchCmaCity: merged current.source',
    data.current.source,
    'cmaFailed',
    data.cmaFailed,
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
