import type { Runtime } from '../../runtime'
import type { CardGroup } from '../card-group'
import type { CachedSource } from '../types'
import { renderCardChrome } from './card-chrome'

export type TabsCardOptions = {
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

export function renderTabsCard(container: HTMLElement, options: TabsCardOptions): void {
  const { group, caches, now, runtime, root, activeTabId, onTabChange, onRefresh, onEdit } = options
  container.dataset['source'] = group.id

  const activeTab = group.tabs.find((t) => t.id === activeTabId) ?? group.tabs[0]!
  const activeCached = caches.get(activeTab.id) ?? null

  const tabsHtml = group.tabs
    .map((tab) => {
      const cached = caches.get(tab.id) ?? null
      const data = cached?.data ?? null
      const labelInfo = tab.getTabLabel ? tab.getTabLabel(data as never) : { label: tab.title }
      const badgeHtml =
        labelInfo.badge != null && labelInfo.badge !== 0 && labelInfo.badge !== ''
          ? `<span class="gm-sp-tab-badge">${labelInfo.badge}</span>`
          : '<span class="gm-sp-tab-badge" hidden></span>'
      const activeClass = tab.id === activeTab.id ? ' gm-sp-tab-active' : ''
      const ariaSelected = tab.id === activeTab.id ? 'true' : 'false'
      return `<button type="button"
                class="gm-sp-tab${activeClass}" role="tab"
                aria-selected="${ariaSelected}"
                data-tab-id="${tab.id}">
        <span class="gm-sp-tab-label">${labelInfo.label}</span>
        ${badgeHtml}
      </button>`
    })
    .join('')
  const panelsHtml = group.tabs
    .map((tab) => {
      const activeClass = tab.id === activeTab.id ? ' gm-sp-tab-panel-active' : ''
      return `<div class="gm-sp-tab-panel${activeClass}"
                   role="tabpanel"
                   data-tab-id="${tab.id}"></div>`
    })
    .join('')

  const chrome = renderCardChrome(container, {
    root,
    runtime,
    now,
    ttlMs: activeTab.ttlMs,
    cached: activeCached,
    titleHtml: `<div class="gm-sp-tabs" role="tablist">${tabsHtml}</div>`,
    bodyHtml: panelsHtml,
    onRefresh: () => onRefresh(activeTab.id),
    edit: activeTab.createEditor
      ? {
          sourceTitle: activeTab.title,
          createEditor: activeTab.createEditor,
          onRevert: () => onEdit(activeTab.id),
        }
      : undefined,
  })

  chrome.header.querySelectorAll<HTMLElement>('.gm-sp-tab').forEach((tabEl) => {
    const tabId = tabEl.dataset['tabId']!
    tabEl.addEventListener('click', () => onTabChange(tabId))
  })
  chrome.body.querySelectorAll<HTMLElement>('.gm-sp-tab-panel').forEach((panel) => {
    const tabId = panel.dataset['tabId']!
    const tab = group.tabs.find((t) => t.id === tabId)!
    const cached = caches.get(tabId) ?? null
    const data = cached?.data ?? null
    tab.render(panel, data as never, { root, runtime })
  })
}
