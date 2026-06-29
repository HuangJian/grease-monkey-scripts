import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import { loadCache } from '../cache'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { createHeaderState, useHeaderState } from '../header-state'
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
  const headerStore = createHeaderState({ activeCityIndex: 0 })

  const source: Source<WeatherData> = {
    id: 'weather',
    title: '\u5929\u6C14',
    ttlMs: options.ttlMinutes * 60_000,
    placement: 'side',
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
    RenderHeader: (props: SourceHeaderProps<WeatherData>) => {
      const hs = useHeaderState(headerStore)
      return (
        <WeatherHeader
          data={props.data}
          activeIndex={hs.activeCityIndex}
          onTabChange={(i: number) => {
            console.debug('[gm-weather] header tab click:', i, 'prev:', hs.activeCityIndex)
            headerStore.set((s) => ({ ...s, activeCityIndex: i }))
          }}
        />
      )
    },
    RenderComponent: (props) => {
      const hs = useHeaderState(headerStore)
      console.debug('[gm-weather] body render, activeIndex:', hs.activeCityIndex)
      return <WeatherComponent {...props} activeIndex={hs.activeCityIndex} />
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
