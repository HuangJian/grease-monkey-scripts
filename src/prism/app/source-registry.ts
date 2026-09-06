import type { Runtime } from '../../runtime'
import { createV2exSource } from '../v2ex'
import { createWeatherSource } from '../weather'
import { createNovelsSource } from '../novels'
import { createRedditSource } from '../reddit'
import { createHupuSource } from '../hupu'
import { createTnewsSource } from '../tnews'
import { createXueqiuSources } from '../xueqiu'
import { createXitSource } from '../xit/source'
import { createMiscSource } from '../misc'
import type { AnySource, Config } from '../types'
import { buildCardGroups, type CardGroup } from '../card-group'

export type SourceRegistry = ReturnType<typeof createSourceRegistry>

export function createSourceRegistry(config: Config, runtime: Runtime) {
  const tnews = createTnewsSource(config.tnews)
  const xueqiu = createXueqiuSources(config.xueqiu)
  // Each element is a member of the `AnySource` discriminated union (§2.6),
  // so the concrete data type `T` survives the registry boundary. No `as`
  // cast: the erasure that `toErasure` used to perform here is gone.
  const sources: AnySource[] = [
    createV2exSource(config.v2ex),
    createWeatherSource(config.weather),
    createNovelsSource(config.novels, runtime),
    createRedditSource(config.reddit),
    createHupuSource(config.hupu),
    tnews.source,
    xueqiu.mainSource,
    xueqiu.hotSource,
  ]
  if (config.xit?.enabled !== false) {
    sources.push(createXitSource(config.xit, runtime))
  }
  sources.push(createMiscSource(runtime))
  const cardGroups = buildCardGroups(sources, config.sourceSettings)
  const groupById = new Map<string, CardGroup>()
  const groupForSource = new Map<string, CardGroup>()
  cardGroups.forEach((group) => {
    groupById.set(group.id, group)
    group.tabs.forEach((tab) => {
      groupForSource.set(tab.id, group)
    })
  })
  return { tnews, xueqiu, sources, cardGroups, groupById, groupForSource }
}

export function findSource(sources: AnySource[], id: string): AnySource | undefined {
  return sources.find((s) => s.id === id)
}
