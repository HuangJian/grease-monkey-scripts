import type { Runtime } from '../../runtime'
import { estimateByteSize } from '../cache'
import type { Source, SourceSettings, TabLabel } from '../types'
import { RETENTION_MS } from './constants'
import { TnewsComponent } from './component'
import { createTnewsEditor, loadFreshTnewsOptions } from './editor'
import { fetchTnews } from './fetcher'
import { filterByRetention, mergeByLink, sortByPubDateDesc } from './parser'
import { createTnewsState, type TnewsState } from './state'
import type { TnewsItem, TnewsSourceOptions } from './types'

export type TnewsHandle = {
  source: Source<TnewsItem[]>
  state: TnewsState
  initRuntime(runtime: Runtime): Promise<void>
}

export function createTnewsSource(options: TnewsSourceOptions): TnewsHandle {
  const state: TnewsState = createTnewsState()
  const source: Source<TnewsItem[]> = {
    id: 'tnews',
    title: '竹新社',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 1,
    RenderComponent: (props) => <TnewsComponent {...props} state={state} now={Date.now()} />,
    getTabLabel(data) {
      return tnewsTabLabel(data, state)
    },
    async fetch(runtime, prevData) {
      const fresh = await loadFreshTnewsOptions(runtime, options)
      await state.loadFromStorage(runtime)
      const result = await fetchTnews(runtime, fresh)
      console.debug(
        '[gm-tnews] fetchTnews items=',
        result.items.length,
        'errors=',
        result.errors.length,
      )
      if (result.errors.length > 0) {
        console.debug('[gm-tnews] partial errors:', result.errors)
      }
      const merged = mergeByLink(prevData ?? [], result.items)
      console.debug('[gm-tnews] merged count=', merged.length)
      const recent = filterByRetention(merged, Date.now(), RETENTION_MS)
      console.debug(
        '[gm-tnews] retention(7d) count=',
        recent.length,
        'dropped=',
        merged.length - recent.length,
      )
      const sorted = sortByPubDateDesc(recent)
      const visible = state.filterVisible(sorted)
      console.debug(
        '[gm-tnews] visible count=',
        visible.length,
        'hidden=',
        sorted.length - visible.length,
      )
      console.debug('[gm-tnews] saveCache byteSize=', estimateByteSize({ data: visible }))
      await state.saveToStorage(runtime)
      return visible
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
    },
    createEditor(settings: SourceSettings) {
      return createTnewsEditor(options, settings)
    },
  }
  const handle: TnewsHandle = {
    source,
    state,
    async initRuntime(runtime) {
      await state.loadFromStorage(runtime)
    },
  }
  return handle
}

export function tnewsTabLabel(data: TnewsItem[] | null, state: TnewsState): TabLabel {
  const items = data ?? []
  const unread = items.reduce((n, it) => n + (state.isRead(it.id) ? 0 : 1), 0)
  return { label: '竹新社', badge: unread > 0 ? unread : null }
}
