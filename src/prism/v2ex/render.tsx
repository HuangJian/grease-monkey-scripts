import { render } from 'preact'
import type { AuthorTagMap } from '../../shared/author-labels'
import type { Runtime } from '../../runtime'
import { V2exComponent } from './component'
import type { V2exState } from './state'
import type { V2exTopic } from './types'

export function renderV2ex(
  container: HTMLElement,
  data: V2exTopic[] | null,
  state: V2exState,
  runtime: Runtime,
  authorTagMap: AuthorTagMap = {},
): void {
  render(null, container)
  render(
    <V2exComponent
      data={data}
      root={undefined as any}
      runtime={runtime}
      state={state}
      authorTagMap={authorTagMap}
      dateFilter="全"
      filterUnread={false}
    />,
    container,
  )
}
