import { render } from 'preact'
import { XitBody } from '../component/body'
import type { XitData } from '../types'
import { parseXitText } from '../parser'

export { renderXitPreview } from './preview'

function getTagCounts(lines: import('../types').XitLine[]): Map<string, number> {
  const counts = new Map<string, number>()
  lines
    .filter((line) => line.type === 'item')
    .forEach((line) => {
      line.tags.forEach((tag) => {
        counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1)
      })
    })
  return counts
}

export function renderXit(container: HTMLElement, data: XitData | null): void {
  render(null, container)
  const text = data?.text ?? ''
  const lines = parseXitText(text)
  const headerState = {
    lines,
    tagCounts: getTagCounts(lines),
    query: '',
    queryError: null,
    filterStore: null,
    showFilters: false,
    saveForm: null,
    editFilter: null,
  }
  render(<XitBody data={data} headerState={headerState} />, container)
}
