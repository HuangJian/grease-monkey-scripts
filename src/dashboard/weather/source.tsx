import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { WeatherComponent, WeatherHeader } from './component'
import { createWeatherEditor } from './editor'
import { fetchWeatherAll } from './api'
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

let activeCityIndex = 0

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  const source: Source<WeatherData> = {
    id: 'weather',
    title: '\u5929\u6C14',
    ttlMs: options.ttlMinutes * 60_000,
    placement: 'side',
    headerState: {},
    async fetch(runtime, _prevData) {
      const cities = await loadFreshWeatherCities(runtime, options.cities)
      return fetchWeatherAll(runtime, cities)
    },
    RenderHeader: (props: SourceHeaderProps<WeatherData>) => (
      <WeatherHeader
        data={props.data}
        activeIndex={activeCityIndex}
        onTabChange={(i: number) => {
          console.debug('[gm-weather] header tab click:', i, 'prev:', activeCityIndex)
          activeCityIndex = i
          console.debug('[gm-weather] calling onHeaderChange:', !!props.onHeaderChange)
          props.onHeaderChange?.()
        }}
      />
    ),
    RenderComponent: (props) => {
      console.debug('[gm-weather] body render, activeIndex:', activeCityIndex)
      return (
        <WeatherComponent
          data={props.data}
          root={props.root}
          runtime={props.runtime}
          activeIndex={activeCityIndex}
        />
      )
    },
    createEditor(_settings: SourceSettings) {
      return createWeatherEditor({
        cities: options.cities,
        ttlMinutes: options.ttlMinutes,
      })
    },
  }
  return source
}
