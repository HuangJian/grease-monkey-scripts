import { loadCache, saveCache } from '../cache'
import type { SourceEditor, SourceEditorResult } from '../types'
import { DEFAULT_XIT_TEXT } from './source'
import type { XitData } from './types'

export function createXitEditor(): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const cached = await loadCache<XitData>(ctx.runtime, 'xit')
    const currentText = cached?.data?.text ?? DEFAULT_XIT_TEXT

    container.insertAdjacentHTML(
      'beforeend',
      `<textarea class="gm-sp-xit-editor-textarea" spellcheck="false"></textarea>`,
    )

    const textarea = container.querySelector('.gm-sp-xit-editor-textarea') as HTMLTextAreaElement
    textarea.value = currentText

    return {
      render() {},
      cancel() {
        ctx.close()
      },
      async save() {
        const newText = textarea.value
        await saveCache(ctx.runtime, 'xit', {
          data: { text: newText },
          fetchedAt: Date.now(),
        })
        ctx.close()
      },
    }
  }
}
