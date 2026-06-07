import type { Runtime } from '../../runtime'
import { requestJson } from './http'
import type { WeatherAirQuality } from './types'

export function buildAirQualityUrl(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: 'us_aqi,pm2_5,pm10',
    timezone: 'auto',
  })
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`
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
