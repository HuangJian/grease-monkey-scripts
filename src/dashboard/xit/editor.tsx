import { render } from 'preact'
import { loadCache, saveCache } from '../cache'
import type { SourceEditor, SourceEditorResult } from '../types'
import { renderXitPreview } from './render'
import { DEFAULT_XIT_TEXT } from './source'
import type { XitData } from './types'

let pendingLineIndex: number | null = null

export function setPendingLineIndex(index: number | null): void {
  pendingLineIndex = index
}

export function createXitEditor(): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const cached = await loadCache<XitData>(ctx.runtime, 'xit')
    const currentText = cached?.data?.text ?? DEFAULT_XIT_TEXT
    const targetLine = pendingLineIndex
    pendingLineIndex = null

    container.classList.add('gm-sp-xit-editor-dual')
    {
      const wrapper = document.createElement('div')
      render(
        <div>
          <div class="gm-sp-xit-editor-pane">
            <textarea class="gm-sp-xit-editor-textarea" spellcheck={false} />
          </div>
          <div class="gm-sp-xit-editor-pane gm-sp-xit-editor-preview" />
        </div>,
        wrapper,
      )
      while (wrapper.firstChild) {
        container.appendChild(wrapper.firstChild)
      }
    }

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

    // Scroll to target line if double-click triggered the editor
    if (targetLine !== null) {
      const textLines = currentText.split(/\r?\n/)
      let charOffset = 0
      for (let i = 0; i < Math.min(targetLine, textLines.length); i++) {
        charOffset += textLines[i]!.length + 1
      }
      const lineEnd = charOffset + (textLines[targetLine]?.length ?? 0)

      requestAnimationFrame(() => {
        const style = getComputedStyle(textarea)
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5
        textarea.scrollTop = targetLine * lineHeight - textarea.clientHeight / 2
        textarea.setSelectionRange(charOffset, lineEnd)
        textarea.focus()
      })
    }

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
