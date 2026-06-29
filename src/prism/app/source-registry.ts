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
import type { Source, Config } from '../types'
import { buildCardGroups, type CardGroup } from '../card-group'

export type SourceRegistry = ReturnType<typeof createSourceRegistry>

export function createSourceRegistry(config: Config, runtime: Runtime) {
  const tnews = createTnewsSource(config.tnews)
  const xueqiu = createXueqiuSources(config.xueqiu)
  const sources: Source<unknown>[] = [
    createV2exSource(config.v2ex) as unknown as Source<unknown>,
    createWeatherSource(config.weather) as unknown as Source<unknown>,
    createNovelsSource(config.novels, runtime) as unknown as Source<unknown>,
    createRedditSource(config.reddit) as unknown as Source<unknown>,
    createHupuSource(config.hupu) as unknown as Source<unknown>,
    tnews.source as unknown as Source<unknown>,
    xueqiu.mainSource as unknown as Source<unknown>,
    xueqiu.hotSource as unknown as Source<unknown>,
  ]
  if (config.xit?.enabled !== false) {
    sources.push(createXitSource(config.xit, runtime) as unknown as Source<unknown>)
  }
  sources.push(createMiscSource(runtime) as unknown as Source<unknown>)
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

export function findSource(sources: Source<unknown>[], id: string): Source<unknown> | undefined {
  return sources.find((s) => s.id === id)
}
