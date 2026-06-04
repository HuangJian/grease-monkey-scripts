import type { Runtime } from '../../runtime'
import type { Source } from '../types'
import { CONFIG_KEY } from '../types'
import { createWeatherEditor } from './editor'
import { fetchWeatherAll } from './api'
import { renderWeather, customizeWeatherHeader } from './render'
import type { WeatherCity, WeatherData, WeatherSourceOptions } from './types'

async function loadFreshWeatherCities(
  runtime: Runtime,
  fallback: WeatherCity[],
): Promise<WeatherCity[]> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const cities = (stored?.weather as { cities?: WeatherCity[] } | undefined)?.cities
    if (Array.isArray(cities) && cities.length > 0) return cities
  } catch {}
  return fallback
}

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  return {
    id: 'weather',
    title: '天气',
    ttlMs: options.ttlMinutes * 60_000,
    placement: 'side',
    async fetch(runtime, _prevData) {
      const cities = await loadFreshWeatherCities(runtime, options.cities)
      return fetchWeatherAll(runtime, cities)
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
