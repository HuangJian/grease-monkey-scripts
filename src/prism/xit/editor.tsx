import { useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks'
import { render } from 'preact'
import { loadCache, saveCache } from '../cache'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
import { renderXitPreview } from './render'
import { DEFAULT_XIT_TEXT } from './source'
import type { XitData } from './types'

type XitEditorFormProps = {
  initialText: string
  targetLine: number | null
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function XitEditorForm({ initialText, targetLine, ctx, handleRef }: XitEditorFormProps) {
  const textRef = useRef(initialText)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  const schedulePreview = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      if (previewRef.current) renderXitPreview(previewRef.current, textRef.current)
    })
  }, [])

  const onInput = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    textRef.current = ta.value
    schedulePreview()
  }, [schedulePreview])

  const onScroll = useCallback(() => {
    const ta = textareaRef.current
    const pv = previewRef.current
    if (!ta || !pv) return
    const ratio = ta.scrollTop / (ta.scrollHeight - ta.clientHeight || 1)
    pv.scrollTop = ratio * (pv.scrollHeight - pv.clientHeight)
  }, [])

  const stopPropagation = useCallback((e: Event) => {
    e.stopPropagation()
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {
        if (previewRef.current) renderXitPreview(previewRef.current, textRef.current)
      },
      async save() {
        cancelAnimationFrame(rafRef.current)
        await saveCache(ctx.runtime, 'xit', {
          data: { text: textRef.current },
          fetchedAt: Date.now(),
          error: '',
        })
        ctx.close()
      },
      cancel() {
        cancelAnimationFrame(rafRef.current)
        ctx.close()
      },
    }
  }, [])

  useLayoutEffect(() => {
    if (previewRef.current) renderXitPreview(previewRef.current, initialText)
  }, [initialText])

  useLayoutEffect(() => {
    if (targetLine === null || !textareaRef.current) return
    const textLines = initialText.split(/\r?\n/)
    const charOffset = textLines
      .slice(0, Math.min(targetLine, textLines.length))
      .reduce((sum, line) => sum + line.length + 1, 0)
    const lineEnd = charOffset + (textLines[targetLine]?.length ?? 0)
    const ta = textareaRef.current
    requestAnimationFrame(() => {
      const style = getComputedStyle(ta)
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5
      ta.scrollTop = targetLine * lineHeight - ta.clientHeight / 2
      ta.setSelectionRange(charOffset, lineEnd)
      ta.focus()
    })
  }, [targetLine, initialText])

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <>
      <div class="gm-sp-xit-editor-pane">
        <textarea
          ref={textareaRef}
          class="gm-sp-xit-editor-textarea"
          spellcheck={false}
          defaultValue={initialText}
          onInput={onInput}
          onScroll={onScroll}
          onKeyDown={stopPropagation}
          onKeyUp={stopPropagation}
        />
      </div>
      <div class="gm-sp-xit-editor-pane gm-sp-xit-editor-preview" ref={previewRef} />
    </>
  )
}

export function createXitEditor(targetLine: number | null = null): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const cached = await loadCache<XitData>(ctx.runtime, 'xit')
    const currentText = cached?.data?.text ?? DEFAULT_XIT_TEXT

    container.classList.add('gm-sp-xit-editor-dual')

    const handleRef: { current: SourceEditorResult | null } = { current: null }

    render(
      <XitEditorForm
        initialText={currentText}
        targetLine={targetLine}
        ctx={ctx}
        handleRef={handleRef}
      />,
      container,
    )

    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
