import type { Runtime } from '../../runtime'
import type { Source } from '../types'
import { XitComponent } from './component'
import { createXitEditor } from './editor'
import { renderXit } from './render'
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
[ ] 多行描述任务:
    这是任务描述的第二行。
    这是第三行。`

export function createXitSource(
  options: { placement?: 'main' | 'side' } | undefined,
  _runtime: Runtime,
): Source<XitData> {
  const placement = options?.placement ?? 'main'

  return {
    id: 'xit',
    title: 'xit',
    ttlMs: 24 * 3600 * 1000, // Large TTL, manually saved
    placement,
    dialogTitle:
      '<a href="https://xit.jotaen.net/" target="_blank" rel="noopener">[x]it! 语法规范</a>',
    RenderComponent: ({ data, root, runtime: r }) => (
      <XitComponent data={data} root={root} runtime={r} />
    ),
    async fetch(runtimeArg, prevData) {
      if (prevData?.text) {
        return prevData
      }
      return { text: DEFAULT_XIT_TEXT }
    },
    render(container, data) {
      renderXit(container, data)
    },
    createEditor() {
      return createXitEditor()
    },
  }
}
