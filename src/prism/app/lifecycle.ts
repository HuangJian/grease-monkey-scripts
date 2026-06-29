import type { Runtime } from '../../runtime'
import { mountOverlay, type OverlayHandle } from '../shell/mount'
import type { CardGroup } from '../card-group'
import type { SourceSettings } from '../types'
import { isTabsGroup } from './group-renderer'

export type MountDeps = {
  runtime: Runtime
  cardGroups: CardGroup[]
  sourceSettings: Record<string, SourceSettings>
  dashboard: { close: () => void }
}

export type DashboardCleanup = () => void

export function mountDashboard(deps: MountDeps): {
  handle: OverlayHandle
  cleanup: DashboardCleanup
} {
  const newHandle = mountOverlay(deps.runtime.document, deps.runtime, () => deps.dashboard.close())
  const onBackdropClick = (e: Event) => {
    if (e.target === newHandle.backdrop) deps.dashboard.close()
  }
  const onCloseClick = () => deps.dashboard.close()
  newHandle.closeBtn.addEventListener('click', onCloseClick)
  newHandle.backdrop.addEventListener('click', onBackdropClick)
  deps.cardGroups.forEach((group) => {
    const container = group.placement === 'side' ? newHandle.sideCards : newHandle.mainCards
    const card = deps.runtime.document.createElement('div')
    card.className = 'gm-sp-card'
    card.dataset['source'] = isTabsGroup(group) ? group.id : group.tabs[0]!.id
    container.appendChild(card)
  })
  return {
    handle: newHandle,
    cleanup: () => {
      newHandle.closeBtn.removeEventListener('click', onCloseClick)
      newHandle.backdrop.removeEventListener('click', onBackdropClick)
    },
  }
}
