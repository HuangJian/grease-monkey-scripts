import type { Runtime } from '../../runtime'
import type { Source } from '../types'
import { createV2exEditor } from './editor'
import { fetchV2ex } from './fetcher'
import { renderV2ex } from './render'
import { createV2exState } from './state'
import type { V2exSourceOptions, V2exTopic } from './types'

const DATE_OPTIONS = ['全部', '今天', '昨天', '前天'] as const
type DateFilter = (typeof DATE_OPTIONS)[number]

function dateFilterBounds(filter: DateFilter, now: number): { start: number; end?: number } | null {
  if (filter === '全部') return null
  const todayStart = new Date(now)
  todayStart.setUTCHours(0, 0, 0, 0)
  const ts = todayStart.getTime()
  switch (filter) {
    case '今天':
      return { start: ts }
    case '昨天':
      return { start: ts - 86400000, end: ts }
    case '前天':
      return { start: ts - 172800000, end: ts - 86400000 }
    default:
      return null
  }
}

export function createV2exSource(options: V2exSourceOptions): Source<V2exTopic[]> {
  const state = createV2exState()
  let runtimeRef: Runtime | null = null
  let dateFilter: DateFilter = '全部'
  let lastContainer: HTMLElement | null = null
  let lastData: V2exTopic[] | null = null

  function applyDateFilter(data: V2exTopic[] | null): V2exTopic[] | null {
    const bounds = dateFilterBounds(dateFilter, Date.now())
    if (!bounds || !data) return data
    return data.filter((t) => {
      if (t.created === undefined) return false
      if (t.created < bounds.start) return false
      if (bounds.end !== undefined && t.created >= bounds.end) return false
      return true
    })
  }

  function doRender(container: HTMLElement, data: V2exTopic[] | null): void {
    renderV2ex(container, applyDateFilter(data), state, runtimeRef)
  }

  return {
    id: 'v2ex',
    title: 'V2EX 热议',
    ttlMs: options.ttlMinutes * 60_000,
    groupId: 'browse',
    order: 0,
    async fetch(runtime, _prevData) {
      runtimeRef = runtime
      await state.loadFromStorage(runtime)
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
    render(container, data) {
      lastContainer = container
      lastData = data
      doRender(container, data)
    },
    customizeHeader(titleContainer, _data) {
      const doc = titleContainer.ownerDocument
      const wrap = doc.createElement('span')
      wrap.className = 'gm-sp-date-filter'

      const select = doc.createElement('select')
      select.className = 'gm-sp-date-filter-select'
      for (const opt of DATE_OPTIONS) {
        const el = doc.createElement('option')
        el.value = opt
        el.textContent = opt
        if (opt === dateFilter) el.selected = true
        select.appendChild(el)
      }

      select.addEventListener('change', () => {
        dateFilter = select.value as DateFilter
        if (lastContainer && lastData !== undefined) {
          doRender(lastContainer, lastData)
        }
      })

      wrap.appendChild(select)
      titleContainer.appendChild(wrap)
    },
    async loadState(runtime) {
      await state.loadFromStorage(runtime)
    },
    createEditor() {
      return createV2exEditor(options)
    },
  }
}
