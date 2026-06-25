import { render } from 'preact'
import { NovelsComponent } from './component'
import type { NovelData } from './types'

export type RenderNovelsContext = {
  onMarkSeen: (bookUrl: string) => void
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
      root={undefined as any}
      runtime={undefined as any}
      onHeaderChange={() => {}}
      onMarkSeen={ctx.onMarkSeen}
    />,
    container,
  )
}
