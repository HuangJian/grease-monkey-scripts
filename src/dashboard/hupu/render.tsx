import { render } from 'preact'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import type { DateFilter } from '../date-filter'
import { HupuComponent } from './component'
import type { ExpandCollapse } from '../expand-collapse'
import type { HupuState } from './state'
import type { HupuRenderData } from './source'

export function renderHupu(
  container: HTMLElement,
  data: HupuRenderData | null,
  state: HupuState,
  runtime: Runtime | null,
  expandCollapse: ExpandCollapse,
  authorTagMap: AuthorTagMap = {},
  dateFilter: DateFilter = '全',
): void {
  render(null, container)
  render(
    <HupuComponent
      data={data}
      state={state}
      runtime={runtime ?? undefined}
      expandCollapse={expandCollapse}
      authorTagMap={authorTagMap}
      dateFilter={dateFilter}
    />,
    container,
  )
}
