/**
 * CMA current weather parsing.
 *
 * Parses CMA real-time weather JSON data.
 */
import type { WeatherCurrent } from '../types'
import { WMO_OVERCAST, CMA_WIND_DIR_TO_DEG } from './constants'
import { numOrNull, parseBeaufortText } from './helpers'

export type CmaNow = {
  current: WeatherCurrent
  lastUpdate: string
}

export function parseCmaNow(json: unknown): CmaNow | null {
  if (!json || typeof json !== 'object') {
    console.debug('[gm-dashboard] cma.parseCmaNow: json is not an object')
    return null
  }
  const obj = json as Record<string, unknown>
  if (obj['code'] !== 0) {
    console.debug('[gm-dashboard] cma.parseCmaNow: code is not 0:', obj['code'])
    return null
  }
  const data = obj['data'] as Record<string, unknown> | undefined
  if (!data) {
    console.debug('[gm-dashboard] cma.parseCmaNow: no data field')
    return null
  }
  const now = data['now'] as Record<string, unknown> | undefined
  if (!now) {
    console.debug('[gm-dashboard] cma.parseCmaNow: no data.now field')
    return null
  }

  const temperature = numOrNull(now['temperature'])
  const pressure = numOrNull(now['pressure'])
  const humidity = numOrNull(now['humidity'])
  const precipitation = numOrNull(now['precipitation'])
  const dirText = (now['windDirection'] as string | undefined)?.trim() ?? ''
  const scaleText = (now['windScale'] as string | undefined)?.trim() ?? ''

  const current: WeatherCurrent = {
    time:
      typeof data['lastUpdate'] === 'string'
        ? (data['lastUpdate'] as string)
        : new Date().toISOString(),
    temperature_2m: temperature ?? 0,
    apparent_temperature: temperature ?? 0,
    weather_code: WMO_OVERCAST,
    wind_speed_10m: parseBeaufortText(scaleText) ?? 0,
    wind_direction_10m: CMA_WIND_DIR_TO_DEG[dirText] ?? 0,
    air_quality: null,
    humidity: humidity ?? undefined,
    pressure: pressure ?? undefined,
    precipitation: precipitation ?? undefined,
    source: 'cma',
  }

  console.debug('[gm-dashboard] cma.parseCmaNow: ok', {
    time: current.time,
    temp: current.temperature_2m,
    dirText,
    scaleText,
  })

  return {
    current,
    lastUpdate: typeof data['lastUpdate'] === 'string' ? (data['lastUpdate'] as string) : '',
  }
}
