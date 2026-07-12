import type { Runtime } from '../../runtime'
import { loadConfigSection } from '../config'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { createHeaderState, useHeaderState } from '../header-state'
import { WeatherComponent, WeatherHeader } from './component'
import { createWeatherEditor } from './editor'
import { fetchWeatherAll } from './api'
import { CMA_RETENTION_MS } from './constants'
import type { WeatherCity, WeatherCityEntry, WeatherData, WeatherSourceOptions } from './types'

async function loadFreshWeatherCities(
  runtime: Runtime,
  fallback: WeatherCity[],
): Promise<WeatherCity[]> {
  return loadConfigSection(runtime, 'weather', fallback, (raw) => {
    const cities = raw['cities']
    return Array.isArray(cities) && cities.length > 0 ? (cities as WeatherCity[]) : fallback
  })
}

/**
 * Reconcile a freshly-fetched entry with its previous cached counterpart.
 *
 * - If the new entry errored entirely, fall back to the previous entry.
 * - If the new entry's CMA fetch failed but the previous entry has CMA data
 *   newer than CMA_RETENTION_MS, retain the previous entry to avoid
 *   degrading to open-meteo.  This handles transient WAF challenge failures
 *   (e.g. background-tab throttling preventing PoW solving in time).
 * - Otherwise, return the new entry as-is.
 */
export function reconcileEntry(
  entry: WeatherCityEntry,
  prev: WeatherCityEntry | undefined,
  now: number,
): WeatherCityEntry {
  if (entry.status === 'error') {
    return prev?.status === 'ok' ? { ...prev } : entry
  }
  if (entry.status === 'ok' && entry.data.cmaFailed && prev?.status === 'ok') {
    const cmaAge = now - (prev.data.cmaFetchedAt ?? 0)
    if (prev.data.cmaFetchedAt != null && cmaAge < CMA_RETENTION_MS) {
      console.debug(
        '[gm-weather] cma retain: keeping previous CMA data, age=',
        Math.round(cmaAge / 60_000),
        'min',
      )
      return { ...prev }
    }
  }
  return entry
}

export function createWeatherSource(options: WeatherSourceOptions): Source<WeatherData> {
  const headerStore = createHeaderState({ activeCityIndex: 0 })

  const source: Source<WeatherData> = {
    id: 'weather',
    title: '\u5929\u6C14',
    ttlMs: options.ttlMinutes * 60_000,
    placement: 'side',
    async fetch(runtime, prevData) {
      const cities = await loadFreshWeatherCities(runtime, options.cities)
      const result = await fetchWeatherAll(runtime, cities)
      if (!prevData) return result
      const prevByLabel = new Map(prevData.entries.map((e) => [e.cityLabel, e]))
      const now = Date.now()
      return {
        ...result,
        entries: result.entries.map((entry) =>
          reconcileEntry(entry, prevByLabel.get(entry.cityLabel), now),
        ),
      }
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
