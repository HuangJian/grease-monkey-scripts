import type { Runtime } from '../../runtime'
import { estimateByteSize } from '../cache'
import type { Source, TabLabel } from '../types'
import { RETENTION_MS } from './constants'
import { createTnewsEditor, loadFreshTnewsOptions } from './editor'
import { fetchTnews } from './fetcher'
import { filterByRetention, mergeByLink, sortByPubDateDesc } from './parser'
import { renderTnews } from './render'
import { createTnewsState, type TnewsState } from './state'
import type { TnewsItem, TnewsSourceOptions } from './types'

export type TnewsHandle = {
  source: Source<TnewsItem[]>
  state: TnewsState
  initRuntime(runtime: Runtime): Promise<void>
}

export function createTnewsSource(options: TnewsSourceOptions): TnewsHandle {
  const state: TnewsState = createTnewsState()
  let runtimeRef: Runtime | null = null
  const source: Source<TnewsItem[]> = {
    id: 'tnews',
    title: '竹新社',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 1,
    getTabLabel(data) {
      return tnewsTabLabel(data, state)
    },
    async fetch(runtime, prevData) {
      runtimeRef = runtime
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
    render(container, data) {
      console.debug('[gm-tnews] render items=', data?.length ?? 0)
      renderTnews(container, data, state, runtimeRef!, Date.now())
    },
    createEditor() {
      return createTnewsEditor(options)
    },
  }
  const handle: TnewsHandle = {
    source,
    state,
    async initRuntime(runtime) {
      runtimeRef = runtime
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
