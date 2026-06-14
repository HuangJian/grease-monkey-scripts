import { useState } from 'preact/hooks'
import type { Runtime } from '../../runtime'
import type { CardGroup } from '../card-group'
import { CONFIG_KEY, type CachedSource, type SourceSettings } from '../types'
import { getSourceSettings } from '../types'
import { Tabs, type TabsItem } from './tabs'
import { RefreshTime, RefreshButton, ConfigButton } from './primitives'
import { showEditorDialog } from '../shell/editor'
import { Card } from './card'

export type TabsCardProps = {
  group: CardGroup
  caches: ReadonlyMap<string, CachedSource<unknown> | null>
  now: number
  runtime: Runtime
  root: ShadowRoot
  activeTabId: string
  sourceSettings: Record<string, SourceSettings>
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
  sourceSettings,
  onTabChange,
  onRefresh: onRefreshCallback,
  onEdit: onEditCallback,
}: TabsCardProps) {
  const [, setHeaderVersion] = useState(0)
  const activeTab = group.tabs.find((t) => t.id === activeTabId) ?? group.tabs[0]!
  const activeCached = caches.get(activeTab.id) ?? null
  const activeData = (activeCached?.data ?? null) as unknown

  const onEdit = activeTab.createEditor
    ? async () => {
        const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
        const storedSettings =
          (stored?.sourceSettings as Record<string, SourceSettings> | undefined) ?? {}
        showEditorDialog(
          document,
          root,
          activeTab.dialogTitle ?? `\u7F16\u8F91 - ${activeTab.title}`,
          runtime,
          (container, close) => {
            const editor = activeTab.createEditor!(getSourceSettings(storedSettings, activeTab.id))
            return editor(container, {
              runtime,
              onRevert: () => onEditCallback(activeTab.id),
              refresh: () => void onRefreshCallback(activeTab.id),
              close,
            })
          },
        )
      }
    : undefined

  const tabItems: TabsItem[] = group.tabs.map((tab) => {
    const cached = caches.get(tab.id) ?? null
    const data = cached?.data ?? null
    const labelInfo = tab.getTabLabel ? tab.getTabLabel(data as never) : { label: tab.title }
    const settings = getSourceSettings(sourceSettings, tab.id)
    const displayLabel = settings.tabTitle || labelInfo.label
    const displayBadge = settings.badgeType === 'none' ? null : labelInfo.badge
    return {
      id: tab.id,
      text: displayLabel,
      badge: displayBadge,
    }
  })

  const HeaderComp = activeTab.RenderHeader

  const headerProps = {
    data: activeData,
    cached: (activeCached ?? null) as CachedSource<unknown> | null,
    now,
    ttlMs: activeTab.ttlMs,
    runtime,
    root,
    onRefresh: () => onRefreshCallback(activeTab.id),
    onEdit,
    onHeaderChange: activeTab.headerState
      ? () => {
          console.debug('[gm-tabs-card] onHeaderChange triggered for', activeTab.id)
          setHeaderVersion((n) => n + 1)
        }
      : undefined,
  }

  const headerContent = HeaderComp ? <HeaderComp {...headerProps} /> : null

  const header = (
    <>
      <Tabs items={tabItems} activeId={activeTabId} onActive={onTabChange} />
      {headerContent}
      {!activeTab.hideHeaderActions && (
        <span class="gm-sp-card-actions">
          <RefreshTime cached={headerProps.cached} now={now} ttlMs={activeTab.ttlMs} />
          <RefreshButton onRefresh={() => onRefreshCallback(activeTab.id)} />
          {onEdit && <ConfigButton onClick={onEdit} />}
        </span>
      )}
    </>
  )

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
            onHeaderChange={tab.headerState ? () => setHeaderVersion((n) => n + 1) : undefined}
          />
        ) : null}
      </div>
    )
  })

  return (
    <Card header={header} error={activeCached?.error ?? ''}>
      <div>{panels}</div>
    </Card>
  )
}
