import type { Runtime } from '../runtime'
import { isStale, loadCache, saveCache } from './cache'
import { releaseLock, tryAcquireLock } from './lock'
import { mountOverlay, type OverlayHandle } from './overlay/mount'
import { renderCard, renderHeader } from './overlay/render'
import { renderTabsCard } from './overlay/tabs-render'
import { createDoubleShiftHandler, isEditableTarget } from './shortcut'
import { createV2exSource } from './v2ex'
import { createWeatherSource } from './weather'
import { createNovelsSource } from './novels'
import { createRedditSource } from './reddit'
import { createTnewsSource } from './tnews'
import { createXitSource } from './xit/source'
import type { Source } from './types'
import { buildCardGroups, type CardGroup } from './card-group'
import { CACHE_KEY, type CachedSource, type Config } from './types'
import { defaultConfigExample, deepMerge, loadConfig, validateConfig } from './config'

export type DashboardOptions = {
  config: Config
}

export function isHostAllowed(config: Config, hostname: string): boolean {
  if (config.hostAllowlist.length === 0) return true
  return config.hostAllowlist.some((entry) => hostname === entry || hostname.endsWith(`.${entry}`))
}

export type Dashboard = {
  start: () => void
  open: () => Promise<void>
  close: () => void
  toggle: () => void
  refreshSource: (sourceId: string) => Promise<void>
  runOpportunisticRefresh: () => Promise<void>
  editConfig: () => void
}

export function createDashboard(runtime: Runtime, options: DashboardOptions): Dashboard {
  const tnews = createTnewsSource(options.config.tnews)
  const sources: Source<unknown>[] = [
    createV2exSource(options.config.v2ex),
    createWeatherSource(options.config.weather),
    createNovelsSource(options.config.novels, runtime),
    createRedditSource(options.config.reddit),
    tnews.source,
  ]
  if (options.config.xit?.enabled !== false) {
    sources.push(createXitSource(options.config.xit, runtime))
  }
  const cardGroups = buildCardGroups(sources)
  const groupById = new Map<string, CardGroup>()
  const groupForSource = new Map<string, CardGroup>()
  for (const group of cardGroups) {
    groupById.set(group.id, group)
    for (const tab of group.tabs) {
      groupForSource.set(tab.id, group)
    }
  }
  const activeTabByGroup = new Map<string, string>()
  let handle: OverlayHandle | null = null
  let mountedUnmount: (() => void) | null = null

  function findSource(id: string): Source<unknown> | undefined {
    return sources.find((s) => s.id === id)
  }

  function cardForGroup(root: ShadowRoot, groupId: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-source="${groupId}"]`)
  }

  function isTabsGroup(group: CardGroup): boolean {
    return group.tabs.length > 1
  }

  async function readGroupCaches(
    group: CardGroup,
  ): Promise<Map<string, CachedSource<unknown> | null>> {
    const map = new Map<string, CachedSource<unknown> | null>()
    await Promise.all(
      group.tabs.map(async (tab) => {
        map.set(tab.id, await loadCache<unknown>(runtime, tab.id))
      }),
    )
    return map
  }

  function revertGroup(groupId: string): void {
    if (!handle) return
    const group = groupById.get(groupId)
    if (!group) return
    void renderGroupById(groupId)
  }

  async function renderAllGroups(now: number): Promise<void> {
    if (!handle) return
    await Promise.all(cardGroups.map((group) => renderGroup(group, now)))
  }

  async function renderGroup(group: CardGroup, now: number): Promise<void> {
    if (!handle) return
    const root = handle.root
    const card = cardForGroup(root, group.id)
    if (!card) return
    const caches = await readGroupCaches(group)
    const activeTabId = activeTabByGroup.get(group.id) ?? group.tabs[0]!.id
    if (isTabsGroup(group)) {
      renderTabsCard(card, {
        group,
        caches,
        now,
        runtime,
        root,
        activeTabId,
        onTabChange: (tabId) => {
          activeTabByGroup.set(group.id, tabId)
          void renderGroupById(group.id)
        },
        onRefresh: (sourceId) => dashboard.refreshSource(sourceId),
        onEdit: (sourceId) => {
          void renderGroupById(groupForSource.get(sourceId)?.id ?? group.id)
        },
      })
    } else {
      const source = group.tabs[0]!
      const cached = caches.get(source.id) ?? null
      renderCard(card, {
        source,
        cached,
        ttlMs: source.ttlMs,
        now,
        runtime,
        root,
        onRefresh: () => dashboard.refreshSource(source.id),
        onRevert: () => revertGroup(group.id),
      })
    }
  }

  async function renderGroupById(groupId: string): Promise<void> {
    if (!handle) return
    const group = groupById.get(groupId)
    if (!group) return
    await renderGroup(group, Date.now())
  }

  async function refreshSource(sourceId: string): Promise<void> {
    console.debug('[gm-dashboard] refreshSource enter sourceId=', sourceId)
    const source = findSource(sourceId)
    if (!source) {
      console.debug('[gm-dashboard] refreshSource source-not-found sourceId=', sourceId)
      return
    }
    const acquired = await tryAcquireLock(runtime, sourceId)
    if (!acquired) {
      console.debug('[gm-dashboard] refreshSource lock-not-acquired sourceId=', sourceId)
      return
    }
    console.debug('[gm-dashboard] refreshSource lock-acquired sourceId=', sourceId)
    const oldCache = await loadCache<unknown>(runtime, sourceId)
    let next: Omit<CachedSource<unknown>, 'schemaVersion' | 'byteSize'> | null = null
    try {
      const data = await source.fetch(runtime, oldCache?.data)
      next = { data, fetchedAt: Date.now() }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.debug('[gm-dashboard] refreshSource fetch-threw sourceId=', sourceId, 'msg=', message)
      next = {
        data: oldCache?.data,
        fetchedAt: oldCache?.fetchedAt ?? Date.now(),
        error: message,
      }
    }
    if (!next) return
    await saveCache(runtime, sourceId, next)
    await releaseLock(runtime, sourceId)
    const group = groupForSource.get(sourceId)
    if (group) {
      await renderGroupById(group.id)
    }
  }

  async function runOpportunisticRefresh(): Promise<void> {
    const now = Date.now()
    for (const source of sources) {
      const cached = await loadCache<unknown>(runtime, source.id)
      if (isStale(cached, source.ttlMs, now)) {
        await refreshSource(source.id)
      }
    }
  }

  function mount(): void {
    if (handle) return
    const newHandle = mountOverlay(runtime.document)
    renderHeader(newHandle.modal, { onClose: () => dashboard.close() })
    const onBackdropClick = (e: Event) => {
      if (e.target === newHandle.backdrop) dashboard.close()
    }
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        dashboard.close()
      }
    }
    newHandle.backdrop.addEventListener('click', onBackdropClick)
    runtime.document.addEventListener('keydown', onKeydown, { capture: true })
    handle = newHandle
    mountedUnmount = () => {
      runtime.document.removeEventListener('keydown', onKeydown, { capture: true })
      newHandle.unmount()
    }
    const now = Date.now()
    for (const group of cardGroups) {
      const card = runtime.document.createElement('div')
      card.className = 'gm-sp-card'
      const container = group.placement === 'side' ? newHandle.sideCards : newHandle.mainCards
      container.appendChild(card)
      if (isTabsGroup(group)) {
        const activeTabId = activeTabByGroup.get(group.id) ?? group.tabs[0]!.id
        const emptyCaches = new Map<string, CachedSource<unknown> | null>()
        for (const tab of group.tabs) emptyCaches.set(tab.id, null)
        renderTabsCard(card, {
          group,
          caches: emptyCaches,
          now,
          runtime,
          root: newHandle.root,
          activeTabId,
          onTabChange: (tabId) => {
            activeTabByGroup.set(group.id, tabId)
            void renderGroupById(group.id)
          },
          onRefresh: (sourceId) => dashboard.refreshSource(sourceId),
          onEdit: (sourceId) => {
            void renderGroupById(groupForSource.get(sourceId)?.id ?? group.id)
          },
        })
      } else {
        const source = group.tabs[0]!
        renderCard(card, {
          source,
          cached: null,
          ttlMs: source.ttlMs,
          now,
          runtime,
          root: newHandle.root,
          onRefresh: () => dashboard.refreshSource(source.id),
          onRevert: () => revertGroup(group.id),
        })
      }
    }
  }

  async function open(): Promise<void> {
    mount()
    await Promise.all(sources.map((s) => s.loadState?.(runtime)))
    await renderAllGroups(Date.now())
    void runOpportunisticRefresh()
  }

  function close(): void {
    if (!handle) return
    mountedUnmount?.()
    handle = null
    mountedUnmount = null
    tnews.state.clear()
  }

  function toggle(): void {
    if (handle) close()
    else void open()
  }

  function alert(message: string): void {
    try {
      runtime.prompt(message, '')
    } catch {
      window.alert(message)
    }
  }

  function editConfig(): void {
    let input: string | null
    try {
      input = runtime.prompt(`粘贴 JSON 覆盖配置（参考示例）：\n${defaultConfigExample()}`, '')
    } catch {
      alert('当前页面禁用了 prompt，无法编辑配置。')
      return
    }
    if (input === null) return
    const trimmed = input.trim()
    if (!trimmed) return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch (e) {
      alert('配置 JSON 解析失败：' + (e instanceof Error ? e.message : String(e)))
      return
    }
    const merged = deepMerge(options.config, parsed)
    const validation = validateConfig(merged)
    if (!validation.ok) {
      alert('配置校验失败：' + validation.error)
      return
    }
    void runtime.setValue('dashboard:v1:config', merged)
    alert('配置已保存，刷新页面后生效。')
  }

  const dashboard: Dashboard = {
    start: () => {
      runtime.registerMenuCommand('打开仪表盘', () => {
        void dashboard.open()
      })
      runtime.registerMenuCommand('编辑仪表盘配置', () => dashboard.editConfig())
      for (const source of sources) {
        runtime.addValueChangeListener(CACHE_KEY(source.id), (_key, _oldValue, _newValue) => {
          if (!handle) return
          const group = groupForSource.get(source.id)
          if (!group) return
          void renderGroupById(group.id)
        })
      }
      if (
        options.config.shortcut.enabled &&
        isHostAllowed(options.config, runtime.location.hostname)
      ) {
        const onKeydown = createDoubleShiftHandler(() => dashboard.toggle(), {
          windowMs: options.config.shortcut.doublePressWindowMs,
          isFocusExempt: isEditableTarget,
        })
        runtime.addEventListener(runtime.document, 'keydown', onKeydown as (e: Event) => void, {
          capture: true,
        })
      }
      runtime.requestIdleCallback(
        () => {
          void runOpportunisticRefresh()
        },
        { timeout: 5000 },
      )
    },
    open,
    close,
    toggle,
    refreshSource,
    runOpportunisticRefresh,
    editConfig,
  }
  return dashboard
}

export async function startDashboard(runtime: Runtime): Promise<void> {
  console.debug('[gm-dashboard] script loaded (debug build)')
  const config = await loadConfig(runtime)
  const dashboard = createDashboard(runtime, { config })
  dashboard.start()
}
