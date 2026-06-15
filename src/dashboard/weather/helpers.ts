import { AQI_LEVELS, WEATHER_CODE_ICON } from './constants'
import type { AqiLevel } from './types'

export function weatherCodeIcon(code: number): string {
  return WEATHER_CODE_ICON[code] ?? '🌡'
}

export function aqiLevel(aqi: number | null | undefined): AqiLevel {
  if (aqi == null || !Number.isFinite(aqi)) return { label: '--', color: '#9ca3af' }
  const found = AQI_LEVELS.find((entry) => aqi <= entry.max)
  return found ? found.level : AQI_LEVELS[AQI_LEVELS.length - 1]!.level
}

export function windDirectionArrow(deg: number): string {
  if (!Number.isFinite(deg)) return '·'
  return '↑'
}

export function formatHourLabel(iso: string): string {
  const m = iso.match(/T(\d{2})/)
  return m ? `${m[1]}:00` : iso
}
