import type { Runtime } from '../../runtime'
import { queryZdic } from './zdic'
import { PopupController } from './popup'

const HANZI_RE = /^[\u{4e00}-\u{9fff}]{1,4}$/u
const PUNCT_RE = /[。！？、，；：""''（）\s]/

function isValidSelection(text: string): boolean {
  if (!text || text.length > 4) return false
  if (PUNCT_RE.test(text)) return false
  return HANZI_RE.test(text)
}

export function startHanziDictionary(runtime: Runtime): void {
  const popup = new PopupController(runtime)

  let currentText = ''
  let isFetching = false
  let lastLookupText = ''

  runtime.document.addEventListener('selectionchange', () => {
    const selection = runtime.document.getSelection()
    console.debug('[gm-hanzi] selectionchange', {
      hasSelection: !!selection,
      isCollapsed: selection?.isCollapsed,
      text: selection?.toString()?.trim(),
    })
    if (!selection || selection.isCollapsed) {
      popup.hideButton()
      return
    }
    const text = selection.toString().trim()
    if (!isValidSelection(text)) {
      console.debug('[gm-hanzi] not valid hanzi:', text)
      popup.hideButton()
      return
    }
    currentText = text

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    console.debug('[gm-hanzi] rect:', { x: rect.x, y: rect.y, right: rect.right, top: rect.top })
    popup.showButton(text, rect.right + 4, rect.top - 20)
  })

  runtime.document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('[data-action="hanzi-dict-lookup"]')) return
    console.debug('[gm-hanzi] button clicked, text:', currentText)
    if (isFetching) return

    const text = currentText
    if (!text || (popup.isPopupOpen && text === lastLookupText)) return

    isFetching = true
    lastLookupText = text
    popup.closePopup()

    queryZdic(runtime, text).then((result) => {
      isFetching = false
      console.debug('[gm-hanzi] query result:', result.ok ? 'ok' : 'error')
      if (result.ok) {
        popup.showResult(result.result)
      } else {
        popup.showError(result.error)
      }
    })
  })
}
