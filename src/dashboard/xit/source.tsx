import type { Runtime } from '../../runtime'
import type { Source, SourceHeaderProps, SourceSettings } from '../types'
import { XitHeaderControls, type XitHeaderState } from './component/header'
import { XitBody } from './component/body'
import { createXitEditor } from './editor'
import { parseXitText } from './parser'
import type { XitData } from './types'

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

function getTagCounts(lines: import('./types').XitLine[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (line.type === 'item') {
      for (const tag of line.tags) {
        counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1)
      }
    }
  }
  return counts
}

export function createXitSource(
  options: { placement?: 'main' | 'side' } | undefined,
  _runtime: Runtime,
): Source<XitData> {
  const placement = options?.placement ?? 'main'

  const headerState: XitHeaderState = {
    lines: [],
    tagCounts: new Map(),
    query: '',
    queryError: null,
    filterStore: null,
    showFilters: false,
    saveForm: null,
    editFilter: null,
  }

  const source: Source<XitData> = {
    id: 'xit',
    title: 'xit',
    ttlMs: 24 * 3600 * 1000,
    placement,
    headerState,
    hideHeaderActions: true,
    dialogTitle: (
      <a href="https://xit.jotaen.net/" target="_blank" rel="noopener">
        [x]it! 语法规范
      </a>
    ),
    RenderHeader: (props: SourceHeaderProps<XitData>) => (
      <XitHeaderControls
        {...props}
        headerState={headerState}
        onHeaderChange={props.onHeaderChange}
      />
    ),
    RenderComponent: ({ data, root, runtime: r, onHeaderChange: _onHeaderChange }) => {
      const text = data?.text ?? ''
      const lines = parseXitText(text)
      headerState.lines = lines
      headerState.tagCounts = getTagCounts(lines)
      return <XitBody data={data} root={root} runtime={r} headerState={headerState} />
    },
    async fetch(runtimeArg, prevData) {
      if (prevData?.text) {
        return prevData
      }
      return { text: DEFAULT_XIT_TEXT }
    },
    createEditor(_settings: SourceSettings) {
      return createXitEditor()
    },
  }
  return source
}
