import type { Runtime } from '../../runtime'
import type { Source } from '../types'
import { FETCH_CAP_FLOOR } from './constants'
import { createV2exEditor } from './editor'
import { fetchV2ex } from './fetcher'
import { renderV2ex } from './render'
import { createV2exState } from './state'
import type { V2exSourceOptions, V2exTopic } from './types'

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  const state = createV2exState()
  let runtimeRef: Runtime | null = null
  return {
    id: 'v2ex',
    title: 'V2EX 热议',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 0,
    async fetch(runtime, _prevData) {
      runtimeRef = runtime
      const fetchCap = Math.max(options.maxItems, FETCH_CAP_FLOOR)
      await state.loadFromStorage(runtime)
      const allTopics = await fetchV2ex(
        runtime,
        fetchCap,
        {
          minItems: options.minItems,
          maxItems: options.maxItems,
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
    render(container, data) {
      renderV2ex(container, data, state, runtimeRef)
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
    },
    createEditor() {
      return createV2exEditor(options)
    },
  }
}
