import { render } from 'preact'
import { XitComponent } from '../component'
import type { XitData } from '../types'

export { renderXitPreview } from './preview'

export function renderXit(container: HTMLElement, data: XitData | null): void {
  render(null, container)
  render(<XitComponent data={data} />, container)
}
