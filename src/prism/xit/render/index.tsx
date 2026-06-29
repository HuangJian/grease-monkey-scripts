import { render } from 'preact'
import { XitBody } from '../component/body'
import type { XitData } from '../types'
import { createHeaderState } from '../../header-state'
import type { XitHeaderState } from '../component/header'

export { renderXitPreview } from './preview'
export { XitList } from './list'

export function renderXit(container: HTMLElement, data: XitData | null): void {
  render(null, container)
  const headerStore = createHeaderState<XitHeaderState>({
    query: '',
    queryError: null,
    filterStore: null,
    showFilters: false,
    saveForm: null,
    editFilter: null,
  })
  render(
    <XitBody
      data={data}
      root={undefined as any}
      runtime={undefined as any}
      headerStore={headerStore}
    />,
    container,
  )
}
