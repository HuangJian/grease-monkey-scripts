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
      `<div class="gm-sp-editor" style="display: flex; flex-direction: column; gap: 12px; height: 100%;">
        <div class="gm-sp-editor-label" style="font-weight: 600; font-size: 13px;">编辑 xit 内容 (xit 格式):</div>
        <textarea class="gm-sp-xit-editor-textarea" spellcheck="false" style="flex: 1 1 auto; min-height: 300px;"></textarea>
        <div class="gm-sp-editor-actions">
          <button type="button" class="gm-sp-editor-btn gm-sp-editor-btn-primary gm-sp-xit-save">保存</button>
          <button type="button" class="gm-sp-editor-btn gm-sp-xit-cancel">取消</button>
        </div>
      </div>`,
    )

    const textarea = container.querySelector('.gm-sp-xit-editor-textarea') as HTMLTextAreaElement
    textarea.value = currentText

    const saveBtn = container.querySelector('.gm-sp-xit-save') as HTMLButtonElement
    const cancelBtn = container.querySelector('.gm-sp-xit-cancel') as HTMLButtonElement

    cancelBtn.addEventListener('click', () => {
      ctx.close()
    })

    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true
      const newText = textarea.value
      await saveCache(ctx.runtime, 'xit', {
        data: { text: newText },
        fetchedAt: Date.now(),
      })
      ctx.close()
    })
  }
}
