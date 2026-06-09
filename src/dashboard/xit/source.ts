import type { Runtime } from '../../runtime'
import type { Source } from '../types'
import { createXitEditor } from './editor'
import { renderXit } from './render'
import type { XitData } from './types'

export const DEFAULT_XIT_TEXT = `xit (xit 语法规范):
[ ] ! 欢迎使用 Antigravity xit -> 2026-06-12 #help
[ ] @ 点击卡片右上角齿轮图标 ⚙ 来编辑这些内容 #usage
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
  runtime: Runtime,
): Source<XitData> {
  const placement = options?.placement ?? 'main'

  return {
    id: 'xit',
    title: 'xit',
    ttlMs: 24 * 3600 * 1000, // Large TTL, manually saved
    placement,
    async fetch(runtimeArg, prevData) {
      if (prevData?.text) {
        return prevData
      }
      return { text: DEFAULT_XIT_TEXT }
    },
    render(container, data) {
      renderXit(container, data, {
        onSaveText: (newText) => {
          const next = {
            data: { text: newText },
            fetchedAt: Date.now(),
          }
          const KEY_PREFIX = 'dashboard:v1'
          const cacheKey = `${KEY_PREFIX}:xit`
          void runtime.setValue(cacheKey, {
            ...next,
            schemaVersion: 2,
            byteSize: new Blob([JSON.stringify(next)]).size,
          })
        },
      })
    },
    createEditor() {
      return createXitEditor()
    },
  }
}
