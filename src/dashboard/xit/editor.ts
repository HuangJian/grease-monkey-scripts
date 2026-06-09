import { loadCache, saveCache } from '../cache'
import type { SourceEditor } from '../types'
import { DEFAULT_XIT_TEXT } from './source'
import type { XitData } from './types'

export function createXitEditor(): SourceEditor {
  return async (container, ctx) => {
    const cached = await loadCache<XitData>(ctx.runtime, 'xit')
    const currentText = cached?.data?.text ?? DEFAULT_XIT_TEXT

    container.insertAdjacentHTML(
      'beforeend',
      `<textarea class="gm-sp-xit-editor-textarea" spellcheck="false"></textarea>`,
    )

    const textarea = container.querySelector('.gm-sp-xit-editor-textarea') as HTMLTextAreaElement
    textarea.value = currentText

    // Wire header save/cancel buttons
    const dialog = container.closest('.gm-sp-editor-dialog-panel') as HTMLElement | null
    const saveBtn = dialog?.querySelector('.gm-sp-xit-save') as HTMLButtonElement | null
    const cancelBtn = dialog?.querySelector('.gm-sp-xit-cancel') as HTMLButtonElement | null

    cancelBtn?.addEventListener('click', () => {
      ctx.close()
    })

    saveBtn?.addEventListener('click', async () => {
      if (saveBtn) saveBtn.disabled = true
      const newText = textarea.value
      await saveCache(ctx.runtime, 'xit', {
        data: { text: newText },
        fetchedAt: Date.now(),
      })
      ctx.close()
    })
  }
}
