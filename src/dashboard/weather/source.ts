import type { Source } from '../sources/types'
import { createWeatherEditor } from './editor'
import { fetchWeatherAll } from './api'
import { renderWeather, customizeWeatherHeader } from './render'
import type { WeatherData, WeatherSourceOptions } from './types'

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  return {
    id: 'weather',
    title: '天气',
    ttlMs: options.ttlMinutes * 60_000,
    placement: 'side',
    fetch(runtime, _prevData) {
      return fetchWeatherAll(runtime, options.cities)
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
