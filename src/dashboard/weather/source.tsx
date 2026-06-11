import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import type { Source } from '../types'
import { WeatherComponent } from './component'
import { createWeatherEditor } from './editor'
import { fetchWeatherAll } from './api'
import { renderWeather, customizeWeatherHeader } from './render'
import type { WeatherCity, WeatherData, WeatherSourceOptions } from './types'

async function loadFreshWeatherCities(
  runtime: Runtime,
  fallback: WeatherCity[],
): Promise<WeatherCity[]> {
  return loadConfigSection(runtime, 'weather', fallback, (raw) => {
    const cities = raw['cities']
    return Array.isArray(cities) && cities.length > 0 ? (cities as WeatherCity[]) : fallback
  })
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
    RenderComponent: (props) => <WeatherComponent {...props} />,
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
