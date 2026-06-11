import { useLayoutEffect, useRef } from 'preact/hooks'
import type { Runtime } from '../../runtime'
import type { CardGroup } from '../card-group'
import type { CachedSource } from '../types'
import type { CardChromeEdit } from '../overlay/card-chrome'
import { CardChrome } from './card-chrome'

export type TabsCardProps = {
  group: CardGroup
  caches: ReadonlyMap<string, CachedSource<unknown> | null>
  now: number
  runtime: Runtime
  root: ShadowRoot
  activeTabId: string
  onTabChange: (tabId: string) => void
  onRefresh: (sourceId: string) => Promise<void>
  onEdit: (sourceId: string) => void
}

function buildEdit(
  tab: CardGroup['tabs'][number],
  onEdit: (sourceId: string) => void,
): CardChromeEdit | undefined {
  if (!tab.createEditor) return undefined
  return {
    sourceTitle: tab.title,
    createEditor: tab.createEditor,
    onRevert: () => onEdit(tab.id),
    dialogTitle: tab.dialogTitle,
  }
}

export function TabsCard({
  group,
  caches,
  now,
  runtime,
  root,
  activeTabId,
  onTabChange,
  onRefresh,
  onEdit,
}: TabsCardProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const activeTab = group.tabs.find((t) => t.id === activeTabId) ?? group.tabs[0]!
  const activeCached = caches.get(activeTab.id) ?? null

  const tabButtons = group.tabs.map((tab) => {
    const cached = caches.get(tab.id) ?? null
    const data = cached?.data ?? null
    const labelInfo = tab.getTabLabel ? tab.getTabLabel(data as never) : { label: tab.title }
    const showBadge = labelInfo.badge != null && labelInfo.badge !== 0 && labelInfo.badge !== ''
    const activeClass = tab.id === activeTab.id ? ' gm-sp-tab-active' : ''
    return (
      <button
        type="button"
        class={`gm-sp-tab${activeClass}`}
        role="tab"
        aria-selected={tab.id === activeTab.id}
        data-tab-id={tab.id}
        onClick={() => onTabChange(tab.id)}
      >
        <span class="gm-sp-tab-label">{labelInfo.label}</span>
        {showBadge && <span class="gm-sp-tab-badge">{labelInfo.badge}</span>}
        {!showBadge && <span class="gm-sp-tab-badge" hidden />}
      </button>
    )
  })

  const panels = group.tabs.map((tab) => {
    const activeClass = tab.id === activeTab.id ? ' gm-sp-tab-panel-active' : ''
    return <div class={`gm-sp-tab-panel${activeClass}`} role="tabpanel" data-tab-id={tab.id} />
  })

  useLayoutEffect(() => {
    if (!bodyRef.current) return
    for (const tab of group.tabs) {
      const panel = bodyRef.current.querySelector(`[data-tab-id="${tab.id}"]`) as HTMLElement | null
      if (!panel) continue
      const cached = caches.get(tab.id) ?? null
      const data = cached?.data ?? null
      tab.render(panel, data as never, { root, runtime })
    }
  })

  useLayoutEffect(() => {
    if (!activeTab.customizeHeader) return
    const data = activeCached?.data ?? null
    const header = bodyRef.current?.closest('.gm-sp-card')?.querySelector('.gm-sp-card-title')
    if (header) activeTab.customizeHeader(header as HTMLElement, data)
  })

  return (
    <CardChrome
      root={root}
      runtime={runtime}
      now={now}
      ttlMs={activeTab.ttlMs}
      cached={activeCached as CachedSource<unknown> | null}
      title={
        <div class="gm-sp-tabs" role="tablist">
          {tabButtons}
        </div>
      }
      onRefresh={() => onRefresh(activeTab.id)}
      edit={buildEdit(activeTab, onEdit)}
      bodyRef={(el) => {
        bodyRef.current = el
      }}
    >
      {panels}
    </CardChrome>
  )
}
