import { render } from 'preact'
import { parseXitText } from '../parser'
import { XitList } from './list'

export function renderXitPreview(container: HTMLElement, text: string): void {
  const lines = parseXitText(text)
  render(
    lines.length === 0 ? <div class="gm-sp-xit-empty">无内容</div> : <XitList lines={lines} />,
    container,
  )
}
