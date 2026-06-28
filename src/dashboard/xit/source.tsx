import type { Runtime } from '../../runtime'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { createHeaderState, type HeaderStateStore } from '../header-state'
import { loadCache, saveCache } from '../cache'
import { XitHeaderControls, type XitHeaderState } from './component/header'
import { XitBody } from './component/body'
import { createXitEditor } from './editor'
import { resetRecurringTasks } from './recurring-reset'
import type { XitData, XitLine } from './types'

export const DEFAULT_XIT_TEXT = `xit (xit 语法规范):
[ ] ! 欢迎使用 Antigravity xit -> 2026-06-12 #help
[ ] @ 点击卡片右上角铅笔图标 ✏ 来编辑这些内容 #usage
[ ] 这是一个普通待办事项
[x] 这是一个已完成的事项 #done
[~] 这是一个已废弃的事项
[?] 这是一个有疑问的事项
[ ] 高优先级任务 !!! #urgent
[ ] 含有到期日的任务 -> 2026-06-20
[ ] 每日重复任务 ->everyday #daily
[ ] 多行描述任务:
    这是任务描述的第二行。
    这是第三行。`

export function getTagCounts(lines: XitLine[]): Map<string, number> {
  const counts = new Map<string, number>()
  lines
    .filter((line) => line.type === 'item')
    .forEach((line) => {
      line.tags.forEach((tag) => {
        counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1)
      })
    })
  return counts
}

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
      return <XitBody data={data} root={root} runtime={r} headerStore={headerStore} />
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
