import { render } from 'preact'
import type { Runtime } from '../../runtime'
import { TnewsComponent } from './component'
import type { TnewsState } from './state'
import type { TnewsItem } from './types'

export function renderTnews(
  container: HTMLElement,
  items: TnewsItem[] | null,
  state: TnewsState,
  runtime: Runtime,
  now: number,
): void {
  render(null, container)
  render(
    <TnewsComponent
      data={items}
      root={undefined as any}
      runtime={runtime}
      state={state}
      now={now}
    />,
    container,
  )
}
