import type { Runtime } from '../../runtime'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { V2EX_AUTHOR_TAGS_KEY, V2EX_AUTHOR_TAGS_LS_KEY } from '../../shared/author-labels'
import { syncAuthorTags } from '../author-tags-sync'
import type { DateFilter } from '../date-filter'
import { DateFilterGroup } from '../date-filter'
import { V2exComponent } from './component'
import { createV2exEditor } from './editor'
import { fetchV2ex } from './fetcher'
import { createV2exState } from './state'
import type { V2exSourceOptions, V2exTopic } from './types'

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  const state = createV2exState()
  let authorTagMap: AuthorTagMap = {}
  const headerState: { dateFilter: DateFilter } = { dateFilter: '全' }

  function isV2exDomain(hostname: string): boolean {
    return hostname === 'v2ex.com' || hostname.endsWith('.v2ex.com')
  }

  async function loadAuthorTags(runtime: Runtime): Promise<void> {
    await syncAuthorTags({
      runtime,
      isDomain: isV2exDomain,
      lsKey: V2EX_AUTHOR_TAGS_LS_KEY,
      gmKey: V2EX_AUTHOR_TAGS_KEY,
      fallbackGmKey: V2EX_AUTHOR_TAGS_LS_KEY,
      target: { map: authorTagMap },
    })
  }

  return {
    id: 'v2ex',
    title: 'V2EX \u70ED\u8BAE',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 0,
    headerState,
    RenderHeader: (props: SourceHeaderProps<V2exTopic[]>) => (
      <DateFilterGroup
        value={headerState.dateFilter}
        onChange={(f) => {
          headerState.dateFilter = f
          props.onHeaderChange?.()
        }}
      />
    ),
    RenderComponent: ({ data, root, runtime }) => (
      <V2exComponent
        data={data}
        root={root}
        runtime={runtime}
        state={state}
        authorTagMap={authorTagMap}
        dateFilter={headerState.dateFilter}
      />
    ),
    async fetch(runtime, _prevData) {
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
      const prevById = new Map<number, V2exTopic>()
      if (_prevData) {
        for (const t of _prevData) prevById.set(t.id, t)
      }
      const allTopics = await fetchV2ex(
        runtime,
        {
          todayMinReplies: options.todayMinReplies,
          olderMinReplies: options.olderMinReplies,
          ageHalfLifeDays: options.ageHalfLifeDays,
        },
        new runtime.DOMParser(),
        state,
        prevById,
      )
      const visible = state.filterVisible(allTopics)
      await state.saveToStorage(runtime)
      return visible
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await loadAuthorTags(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createV2exEditor(options, settings)
    },
  }
}
