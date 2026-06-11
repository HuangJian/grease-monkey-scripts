import type { Runtime } from '../../runtime'
import type { Source } from '../types'
import {
  AUTHOR_TAGS_LS_KEY,
  parseAuthorTagMap,
  type AuthorTagMap,
} from '../../shared/author-labels'
import { V2exComponent } from './component'
import { createV2exEditor } from './editor'
import { fetchV2ex } from './fetcher'
import { renderV2ex } from './render'
import { createV2exState } from './state'
import type { V2exSourceOptions, V2exTopic } from './types'

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  const state = createV2exState()
  let runtimeRef: Runtime | null = null
  let authorTagMap: AuthorTagMap = {}

  function isV2exDomain(hostname: string): boolean {
    return hostname === 'v2ex.com' || hostname.endsWith('.v2ex.com')
  }

  async function syncAuthorTags(runtime: Runtime): Promise<void> {
    try {
      if (isV2exDomain(runtime.location.hostname)) {
        const raw = localStorage.getItem(AUTHOR_TAGS_LS_KEY)
        if (raw) {
          authorTagMap = parseAuthorTagMap(JSON.parse(raw))
          await runtime.setValue(AUTHOR_TAGS_LS_KEY, authorTagMap)
          return
        }
      }
      const stored = await runtime.getValue<unknown>(AUTHOR_TAGS_LS_KEY, null)
      authorTagMap = stored ? parseAuthorTagMap(stored) : {}
    } catch {
      authorTagMap = {}
    }
  }

  return {
    id: 'v2ex',
    title: 'V2EX 热议',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 0,
    RenderComponent: ({ data, root, runtime }) => (
      <V2exComponent
        data={data}
        root={root}
        runtime={runtime}
        state={state}
        authorTagMap={authorTagMap}
      />
    ),
    async fetch(runtime, _prevData) {
      runtimeRef = runtime
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
      const allTopics = await fetchV2ex(
        runtime,
        {
          minItems: options.minItems,
          displayRatio: options.displayRatio,
          elbowDropRatio: options.elbowDropRatio,
          minReplies: options.minReplies,
          ageHalfLifeDays: options.ageHalfLifeDays,
        },
        new runtime.DOMParser(),
        state,
      )
      const visible = state.filterVisible(allTopics)
      await state.saveToStorage(runtime)
      return visible
    },
    render(container, data, ctx) {
      renderV2ex(container, data, state, runtimeRef ?? ctx?.runtime ?? null, authorTagMap)
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
      await syncAuthorTags(runtime)
    },
    createEditor() {
      return createV2exEditor(options)
    },
  }
}
