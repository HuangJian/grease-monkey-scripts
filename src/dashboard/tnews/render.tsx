import { render } from 'preact'
import type { Runtime } from '../../runtime'
import { TnewsComponent } from './component'
import type { TnewsState } from './state'
import type { TnewsItem } from './types'

export function renderTnews(
  container: HTMLElement,
  items: TnewsItem[] | null,
  state: TnewsState,
  runtime: Runtime | null,
  now: number,
): void {
  render(null, container)
  render(
    <TnewsComponent data={items} state={state} runtime={runtime ?? undefined} now={now} />,
    container,
  )
}
