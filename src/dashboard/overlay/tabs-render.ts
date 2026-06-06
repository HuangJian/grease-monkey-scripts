import type { Runtime } from '../../runtime'
import { isVeryStale } from '../cache'
import type { CardGroup } from '../card-group'
import type { CachedSource } from '../types'
import { formatRelativeTime, showEditorDialog } from './render'

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
  const { group, caches, now, runtime, activeTabId, onTabChange, onRefresh, onEdit } = options
  const document = container.ownerDocument
  container.replaceChildren()
  container.dataset['source'] = group.id

  const activeTab = group.tabs.find((t) => t.id === activeTabId) ?? group.tabs[0]!
  const activeCached = caches.get(activeTab.id) ?? null

  const editButtonHtml = activeTab.createEditor
    ? '<button type="button" class="gm-sp-edit" aria-label="edit">⚙</button>'
    : ''
  const staleHtml = isVeryStale(activeCached, activeTab.ttlMs, now)
    ? '<span class="gm-sp-card-stale">数据陈旧</span>'
    : ''
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
  const errorText = activeCached?.error ?? ''
  const errorClasses = `gm-sp-card-error${activeCached?.error ? ' gm-sp-error' : ''}`
  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-card-header">
      <div class="gm-sp-card-title">
        <div class="gm-sp-tabs" role="tablist">${tabsHtml}</div>
      </div>
      ${staleHtml}
      <div class="gm-sp-card-actions">
        <span class="gm-sp-card-updated">
          ${formatRelativeTime(activeCached?.fetchedAt ?? null, now)}
        </span>
        <button type="button" class="gm-sp-refresh" aria-label="refresh">
          <span class="gm-sp-refresh-icon">↻</span>
        </button>
        ${editButtonHtml}
      </div>
    </div>
    <div class="${errorClasses}">${errorText}</div>
    <div class="gm-sp-card-body">${panelsHtml}</div>`,
  )
  container.querySelectorAll<HTMLElement>('.gm-sp-tab').forEach((tabEl) => {
    const tabId = tabEl.dataset['tabId']!
    tabEl.addEventListener('click', () => onTabChange(tabId))
  })
  const refresh = container.querySelector('.gm-sp-refresh') as HTMLButtonElement
  refresh.addEventListener('click', () => {
    console.debug('[gm-dashboard] tabs.refresh click activeTab=', activeTab.id)
    refresh.disabled = true
    refresh.classList.add('gm-sp-refresh-loading')
    onRefresh(activeTab.id).then(
      () => {
        console.debug('[gm-dashboard] tabs.refresh resolved activeTab=', activeTab.id)
        refresh.disabled = false
        refresh.classList.remove('gm-sp-refresh-loading')
      },
      (e) => {
        console.debug('[gm-dashboard] tabs.refresh rejected activeTab=', activeTab.id, e)
        refresh.disabled = false
        refresh.classList.remove('gm-sp-refresh-loading')
      },
    )
  })
  if (activeTab.createEditor) {
    const edit = container.querySelector('.gm-sp-edit') as HTMLButtonElement
    edit.addEventListener('click', () => {
      showEditorDialog(
        document,
        options.root,
        activeTab.title,
        runtime,
        async (dialogBody, dialogClose) => {
          const editor = activeTab.createEditor!()
          await editor(dialogBody, {
            runtime,
            onRevert: () => onEdit(activeTab.id),
            close: dialogClose,
          })
        },
      )
    })
  }
  container.querySelectorAll<HTMLElement>('.gm-sp-tab-panel').forEach((panel) => {
    const tabId = panel.dataset['tabId']!
    const tab = group.tabs.find((t) => t.id === tabId)!
    const cached = caches.get(tabId) ?? null
    const data = cached?.data ?? null
    tab.render(panel, data as never)
  })
}
