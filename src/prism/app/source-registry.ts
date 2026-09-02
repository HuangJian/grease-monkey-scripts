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

/** Weaken a concrete `Source<T>` to `Source<unknown>` only here, at the
 * registry boundary, so downstream generic consumers (card/render/refresh)
 * share one erasure point instead of eleven scattered double-casts. */
function toErasure<T>(source: Source<T>): Source<unknown> {
  return source as unknown as Source<unknown>
}

export function createSourceRegistry(config: Config, runtime: Runtime) {
  const tnews = createTnewsSource(config.tnews)
  const xueqiu = createXueqiuSources(config.xueqiu)
  const sources: Source<unknown>[] = [
    toErasure(createV2exSource(config.v2ex)),
    toErasure(createWeatherSource(config.weather)),
    toErasure(createNovelsSource(config.novels, runtime)),
    toErasure(createRedditSource(config.reddit)),
    toErasure(createHupuSource(config.hupu)),
    toErasure(tnews.source),
    toErasure(xueqiu.mainSource),
    toErasure(xueqiu.hotSource),
  ]
  if (config.xit?.enabled !== false) {
    sources.push(toErasure(createXitSource(config.xit, runtime)))
  }
  sources.push(toErasure(createMiscSource(runtime)))
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
