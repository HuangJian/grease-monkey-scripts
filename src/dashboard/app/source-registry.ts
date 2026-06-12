import type { Runtime } from '../../runtime'
import { createV2exSource } from '../v2ex'
import { createWeatherSource } from '../weather'
import { createNovelsSource } from '../novels'
import { createRedditSource } from '../reddit'
import { createTnewsSource } from '../tnews'
import { createXitSource } from '../xit/source'
import type { Source, Config } from '../types'
import { buildCardGroups, type CardGroup } from '../card-group'

export type SourceRegistry = ReturnType<typeof createSourceRegistry>

export function createSourceRegistry(config: Config, runtime: Runtime) {
  const tnews = createTnewsSource(config.tnews)
  const sources: Source<unknown>[] = [
    createV2exSource(config.v2ex),
    createWeatherSource(config.weather),
    createNovelsSource(config.novels, runtime),
    createRedditSource(config.reddit),
    tnews.source,
  ]
  if (config.xit?.enabled !== false) {
    sources.push(createXitSource(config.xit, runtime))
  }
  const cardGroups = buildCardGroups(sources)
  const groupById = new Map<string, CardGroup>()
  const groupForSource = new Map<string, CardGroup>()
  for (const group of cardGroups) {
    groupById.set(group.id, group)
    for (const tab of group.tabs) {
      groupForSource.set(tab.id, group)
    }
  }
  return { tnews, sources, cardGroups, groupById, groupForSource }
}

export function findSource(sources: Source<unknown>[], id: string): Source<unknown> | undefined {
  return sources.find((s) => s.id === id)
}
