import { loadCache, saveCache } from '../cache'
import type { SourceEditor, SourceEditorResult } from '../types'
import { renderXitPreview } from './render'
import { DEFAULT_XIT_TEXT } from './source'
import type { XitData } from './types'

export function createXitEditor(): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const cached = await loadCache<XitData>(ctx.runtime, 'xit')
    const currentText = cached?.data?.text ?? DEFAULT_XIT_TEXT

    container.classList.add('gm-sp-xit-editor-dual')
    container.insertAdjacentHTML(
      'beforeend',
      `<div class="gm-sp-xit-editor-pane">
        <textarea class="gm-sp-xit-editor-textarea" spellcheck="false"></textarea>
      </div>
      <div class="gm-sp-xit-editor-pane gm-sp-xit-editor-preview"></div>`,
    )

    const textarea = container.querySelector('.gm-sp-xit-editor-textarea') as HTMLTextAreaElement
    const preview = container.querySelector('.gm-sp-xit-editor-preview') as HTMLElement
    textarea.value = currentText

    let rafId = 0
    function schedulePreview() {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        renderXitPreview(preview, textarea.value)
      })
    }

    textarea.addEventListener('input', schedulePreview)

    // Prevent keyboard events from bubbling to GitHub's shortcut handler
    textarea.addEventListener('keydown', (e) => e.stopPropagation())
    textarea.addEventListener('keyup', (e) => e.stopPropagation())

    // Scroll sync: textarea → preview
    textarea.addEventListener('scroll', () => {
      const ratio = textarea.scrollTop / (textarea.scrollHeight - textarea.clientHeight || 1)
      preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight)
    })

    // Initial preview render
    renderXitPreview(preview, currentText)

    return {
      render() {
        renderXitPreview(preview, textarea.value)
      },
      cancel() {
        cancelAnimationFrame(rafId)
        ctx.close()
      },
      async save() {
        cancelAnimationFrame(rafId)
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
