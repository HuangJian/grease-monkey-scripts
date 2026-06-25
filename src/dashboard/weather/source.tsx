import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import { loadCache } from '../cache'
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

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  const headerState: { activeCityIndex: number } = { activeCityIndex: 0 }

  const source: Source<WeatherData> = {
    id: 'weather',
    title: '\u5929\u6C14',
    ttlMs: options.ttlMinutes * 60_000,
    placement: 'side',
    headerState,
    async fetch(runtime, _prevData) {
      const cities = await loadFreshWeatherCities(runtime, options.cities)
      let result = await fetchWeatherAll(runtime, cities)
      const prev = (await loadCache<WeatherData>(runtime, 'weather'))?.data
      if (prev) {
        const prevByLabel = new Map(prev.entries.map((e) => [e.cityLabel, e]))
        result = {
          ...result,
          entries: result.entries.map((entry) => {
            if (entry.status !== 'error') return entry
            const prevEntry = prevByLabel.get(entry.cityLabel)
            return prevEntry?.status === 'ok' ? { ...prevEntry } : entry
          }),
        }
      }
      return result
    },
    RenderHeader: (props: SourceHeaderProps<WeatherData>) => (
      <WeatherHeader
        data={props.data}
        activeIndex={headerState.activeCityIndex}
        onTabChange={(i: number) => {
          console.debug('[gm-weather] header tab click:', i, 'prev:', headerState.activeCityIndex)
          headerState.activeCityIndex = i
          console.debug('[gm-weather] calling onHeaderChange')
          props.onHeaderChange()
        }}
      />
    ),
    RenderComponent: (props) => {
      console.debug('[gm-weather] body render, activeIndex:', headerState.activeCityIndex)
      return <WeatherComponent {...props} activeIndex={headerState.activeCityIndex} />
    },
    createEditor(_settings: SourceSettings) {
      return createWeatherEditor({
        cities: options.cities,
        ttlMinutes: options.ttlMinutes,
      })
    },
    async loadState(_runtime) {
      /* weather is stateless */
    },
  }
  return source
}
