import { render } from 'preact'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import type { DateFilter } from '../date-filter'
import { RedditComponent } from './component'
import type { ExpandCollapse } from '../expand-collapse'
import type { RedditState } from './state'
import type { RedditRenderData } from './source'

export function renderReddit(
  container: HTMLElement,
  data: RedditRenderData | null,
  state: RedditState,
  runtime: Runtime,
  expandCollapse: ExpandCollapse,
  authorTagMap: AuthorTagMap = {},
  dateFilter: DateFilter = '全',
): void {
  render(null, container)
  render(
    <RedditComponent
      data={data}
      root={undefined as any}
      runtime={runtime}
      state={state}
      expandCollapse={expandCollapse}
      authorTagMap={authorTagMap}
      dateFilter={dateFilter}
      filterUnread={false}
    />,
    container,
  )
}
