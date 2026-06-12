import { useLayoutEffect, useRef } from 'preact/hooks'
import type { Runtime } from '../../runtime'
import type { CardGroup } from '../card-group'
import type { CachedSource } from '../types'
import { EDIT_ICONS, DEFAULT_EDIT_ICON, CardActions } from './chrome'
import { showEditorDialog } from '../shell/editor'
import { Card } from './card'

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

export function TabsCard({
  group,
  caches,
  now,
  runtime,
  root,
  activeTabId,
  onTabChange,
  onRefresh: onRefreshCallback,
  onEdit: onEditCallback,
}: TabsCardProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const activeTab = group.tabs.find((t) => t.id === activeTabId) ?? group.tabs[0]!
  const activeCached = caches.get(activeTab.id) ?? null
  const edit = activeTab.createEditor
    ? { icon: EDIT_ICONS[activeTab.title] ?? DEFAULT_EDIT_ICON, id: activeTab.id }
    : undefined
  const onEdit = edit
    ? () => {
        showEditorDialog(
          document,
          root,
          activeTab.dialogTitle ?? `\u7F16\u8F91 - ${activeTab.title}`,
          runtime,
          (container, close) => {
            const editor = activeTab.createEditor!()
            return editor(container, {
              runtime,
              onRevert: () => onEditCallback(edit.id),
              close,
            })
          },
        )
      }
    : undefined

  const tabButtons = group.tabs.map((tab) => {
    const cached = caches.get(tab.id) ?? null
    const data = cached?.data ?? null
    const labelInfo = tab.getTabLabel ? tab.getTabLabel(data as never) : { label: tab.title }
    const showBadge = labelInfo.badge != null && labelInfo.badge !== 0 && labelInfo.badge !== ''
    const badgeHidden = showBadge ? undefined : true
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
        <span class="gm-sp-tab-badge" hidden={badgeHidden}>
          {labelInfo.badge}
        </span>
      </button>
    )
  })

  const panels = group.tabs.map((tab) => {
    const isActive = tab.id === activeTab.id
    const activeClass = isActive ? ' gm-sp-tab-panel-active' : ''
    const cached = caches.get(tab.id) ?? null
    const data = cached?.data ?? null
    const Comp = tab.RenderComponent
    return (
      <div
        class={`gm-sp-tab-panel${activeClass}`}
        role="tabpanel"
        data-tab-id={tab.id}
        hidden={!isActive}
      >
        {Comp ? (
          <Comp
            data={data as never}
            root={root}
            runtime={runtime}
            onNotify={() => onTabChange(activeTab.id)}
          />
        ) : null}
      </div>
    )
  })

  useLayoutEffect(() => {
    if (!bodyRef.current) return
    for (const tab of group.tabs) {
      if (tab.RenderComponent) continue
      const panel = bodyRef.current.querySelector(`[data-tab-id="${tab.id}"]`) as HTMLElement | null
      if (!panel) continue
      const cached = caches.get(tab.id) ?? null
      const data = cached?.data ?? null
      tab.render(panel, data as never, { root, runtime })
    }
  })

  return (
    <Card
      header={
        <>
          <div class="gm-sp-tabs" role="tablist">
            {tabButtons}
          </div>
          <CardActions
            cached={(activeCached ?? null) as { fetchedAt: number } | null}
            now={now}
            ttlMs={activeTab.ttlMs}
            editIcon={edit?.icon}
            onEdit={onEdit}
            onRefresh={() => onRefreshCallback(activeTab.id)}
          />
        </>
      }
      error={activeCached?.error ?? ''}
    >
      <div ref={bodyRef}>{panels}</div>
    </Card>
  )
}
