import type { Runtime } from '../../runtime'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { createHeaderState, type HeaderStateStore } from '../header-state'
import { loadCache, saveCache } from '../cache'
import { XitHeaderControls, type XitHeaderState } from './component/header'
import { XitBody } from './component/body'
import { createXitEditor } from './editor'
import { DEFAULT_XIT_TEXT } from './constants'
import { resetRecurringTasks } from './recurring-reset'
import type { XitData } from './types'

export function createXitSource(
  options: { placement?: 'main' | 'side' } | undefined,
  _runtime: Runtime,
): Source<XitData> {
  const placement = options?.placement ?? 'main'

  const headerStore: HeaderStateStore<XitHeaderState> = createHeaderState<XitHeaderState>({
    query: '',
    queryError: null,
    filterStore: null,
    showFilters: false,
    saveForm: null,
    editFilter: null,
  })

  const source: Source<XitData> = {
    id: 'xit',
    title: 'xit',
    ttlMs: 24 * 3600 * 1000,
    // xit 的 fetch 携带每日/每周重复任务的自动取消勾选（recurring-reset）。
    // 用「本地自然日」而非 24h TTL 作为刷新判据，使其每天 0:00（浏览器时区）
    // 之后触发刷新，而不是在上次抓取的 24 小时后才刷新。
    refreshDailyAtLocalMidnight: true,
    placement,
    hideHeaderActions: true,
    dialogTitle: (
      <a href="https://xit.jotaen.net/" target="_blank" rel="noopener">
        [x]it! 语法规范
      </a>
    ),
    RenderHeader: (props: SourceHeaderProps<XitData>) => (
      <XitHeaderControls {...props} headerStore={headerStore} />
    ),
    RenderComponent: ({ data, root, runtime: r }) => {
      return (
        <XitBody
          data={data}
          root={root}
          runtime={r}
          headerStore={headerStore}
          createEditor={createXitEditor}
        />
      )
    },
    async fetch(runtimeArg, prevData) {
      const text = prevData?.text ?? DEFAULT_XIT_TEXT
      return { text: await resetRecurringTasks(runtimeArg, text) }
    },
    createEditor(_settings: SourceSettings) {
      return createXitEditor()
    },
    async loadState(runtime) {
      const cached = await loadCache<XitData>(runtime, 'xit')
      if (!cached?.data?.text) return
      const newText = await resetRecurringTasks(runtime, cached.data.text)
      if (newText !== cached.data.text) {
        await saveCache(runtime, 'xit', {
          data: { text: newText },
          fetchedAt: cached.fetchedAt,
          error: cached.error,
        })
      }
    },
  }
  return source
}
