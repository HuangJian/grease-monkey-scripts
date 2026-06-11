import { parseXitText } from '../parser'
import { linesToHtml } from './list-render'

export function renderXitPreview(container: HTMLElement, text: string): void {
  const lines = parseXitText(text)
  if (lines.length === 0) {
    container.innerHTML = `<div class="gm-sp-xit-empty">无内容</div>`
    return
  }
  container.innerHTML = linesToHtml(lines)
}
