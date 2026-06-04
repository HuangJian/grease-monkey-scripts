import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import { isVeryStale } from '../cache'
import type { CardGroup } from '../card-group'
import type { CachedSource } from '../types'
import { formatRelativeTime } from './render'

export type TabsCardOptions = {
  group: CardGroup
  caches: ReadonlyMap<string, CachedSource<unknown> | null>
  now: number
  runtime: Runtime
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

  const header = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-card-header">
      <div class="gm-sp-card-title"></div>
      <div class="gm-sp-card-actions">
        <span class="gm-sp-card-updated"></span>
        <button type="button" class="gm-sp-refresh" aria-label="refresh"><span class="gm-sp-refresh-icon">↻</span></button>
      </div>
    </div>`,
  )

  const titleEl = header.querySelector('.gm-sp-card-title')!
  const tabsEl = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-tabs" role="tablist"></div>`,
  )
  for (const tab of group.tabs) {
    const cached = caches.get(tab.id) ?? null
    const data = cached?.data ?? null
    const labelInfo = tab.getTabLabel ? tab.getTabLabel(data as never) : { label: tab.title }
    const tabEl = htmlToElement<HTMLButtonElement>(
      document,
      `<button type="button" class="gm-sp-tab" role="tab" aria-selected="false">
        <span class="gm-sp-tab-label"></span>
        <span class="gm-sp-tab-badge" hidden></span>
      </button>`,
    )
    tabEl.dataset['tabId'] = tab.id
    tabEl.querySelector('.gm-sp-tab-label')!.textContent = labelInfo.label
    const badgeEl = tabEl.querySelector('.gm-sp-tab-badge') as HTMLElement
    if (labelInfo.badge != null && labelInfo.badge !== 0 && labelInfo.badge !== '') {
      badgeEl.textContent = String(labelInfo.badge)
      badgeEl.hidden = false
    }
    if (tab.id === activeTab.id) {
      tabEl.classList.add('gm-sp-tab-active')
      tabEl.setAttribute('aria-selected', 'true')
    }
    tabEl.addEventListener('click', () => onTabChange(tab.id))
    tabsEl.appendChild(tabEl)
  }
  titleEl.appendChild(tabsEl)

  if (isVeryStale(activeCached, activeTab.ttlMs, now)) {
    const badge = htmlToElement<HTMLSpanElement>(
      document,
      '<span class="gm-sp-card-stale">数据陈旧</span>',
    )
    header.insertBefore(badge, header.querySelector('.gm-sp-card-actions')!)
  }
  const updated = header.querySelector('.gm-sp-card-updated')!
  updated.textContent = formatRelativeTime(activeCached?.fetchedAt ?? null, now)

  const refresh = header.querySelector('.gm-sp-refresh') as HTMLButtonElement
  refresh.addEventListener('click', () => {
    refresh.disabled = true
    refresh.classList.add('gm-sp-refresh-loading')
    onRefresh(activeTab.id).then(
      () => {
        refresh.disabled = false
        refresh.classList.remove('gm-sp-refresh-loading')
      },
      () => {
        refresh.disabled = false
        refresh.classList.remove('gm-sp-refresh-loading')
      },
    )
  })

  if (activeTab.createEditor) {
    const editBtn = htmlToElement<HTMLButtonElement>(
      document,
      '<button type="button" class="gm-sp-edit" aria-label="edit">⚙</button>',
    )
    const actions = header.querySelector('.gm-sp-card-actions')!
    actions.insertBefore(editBtn, refresh)
    editBtn.addEventListener('click', () => {
      refresh.disabled = true
      editBtn.disabled = true
      const body = container.querySelector('.gm-sp-card-body') as HTMLElement | null
      if (body) {
        const editor = activeTab.createEditor!()
        editor(body, { runtime, onRevert: () => onEdit(activeTab.id) })
      }
    })
  }

  container.appendChild(header)

  const errorEl = document.createElement('div')
  errorEl.className = 'gm-sp-card-error'
  if (activeCached?.error) {
    errorEl.classList.add('gm-sp-error')
    errorEl.textContent = activeCached.error
  }
  container.appendChild(errorEl)

  const body = document.createElement('div')
  body.className = 'gm-sp-card-body'
  container.appendChild(body)
  for (const tab of group.tabs) {
    const panel = htmlToElement<HTMLDivElement>(
      document,
      `<div class="gm-sp-tab-panel" role="tabpanel"></div>`,
    )
    panel.dataset['tabId'] = tab.id
    if (tab.id === activeTab.id) {
      panel.classList.add('gm-sp-tab-panel-active')
    }
    const cached = caches.get(tab.id) ?? null
    const data = cached?.data ?? null
    tab.render(panel, data as never)
    body.appendChild(panel)
  }
}
