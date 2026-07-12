import type { AqiLevel } from './types'

export const WEATHER_CODE_ICON: Record<number, string> = {
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

export const AQI_LEVELS: Array<{ max: number; level: AqiLevel }> = [
  { max: 50, level: { label: '优', color: '#10b981' } },
  { max: 100, level: { label: '良', color: '#eab308' } },
  { max: 150, level: { label: '轻污染', color: '#f97316' } },
  { max: 200, level: { label: '中污染', color: '#ef4444' } },
  { max: 300, level: { label: '重污染', color: '#a855f7' } },
  { max: 500, level: { label: '严重', color: '#7f1d1d' } },
]

export const FORECAST_DAYS = 4

/** If CMA fetch fails but previous CMA data is younger than this, retain it. */
export const CMA_RETENTION_MS = 6 * 60 * 60 * 1000
