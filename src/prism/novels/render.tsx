import { render } from 'preact'
import type { Runtime } from '../../runtime'
import { NovelsComponent } from './component'
import type { NovelData } from './types'

export type RenderNovelsContext = {
  runtime: Runtime
  onMarkSeen: (bookId: string) => void
}

export function renderNovels(
  container: HTMLElement,
  data: NovelData | null,
  ctx: RenderNovelsContext,
): void {
  render(null, container)
  render(
    <NovelsComponent
      data={data}
      root={container}
      runtime={ctx.runtime}
      onMarkSeen={ctx.onMarkSeen}
    />,
    container,
  )
}
