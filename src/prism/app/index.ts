import type { Runtime } from '../../runtime'
import { CACHE_KEY, type Source } from '../types'
import type { Config } from '../config/types'
import { loadConfig } from '../config'
import { createSourceRegistry, findSource } from './source-registry'
import { renderAllGroups, renderGroupById, type GroupRendererDeps } from './group-renderer'
import { refreshSource, runOpportunisticRefresh } from './refresh'
import { mountDashboard } from './lifecycle'
import { bootstrapShortcut } from './shortcut-bootstrap'
import { bootstrapSync } from './sync-bootstrap'
import type { OverlayHandle } from '../shell/mount'
import { showEditorDialog } from '../shell/editor'

export { isHostAllowed } from './host-allowlist'

export type DashboardOptions = {
  config: Config
}

export type Dashboard = {
  start: () => void
  open: () => Promise<OverlayHandle>
  close: () => void
  toggle: () => void
  refreshSource: (sourceId: string) => Promise<void>
  runOpportunisticRefresh: () => Promise<void>
  destroy: () => void
}

const FOREGROUND_REFRESH_INTERVAL_MS = 60_000
const BACKGROUND_REFRESH_BASE_MS = 300_000
const BACKGROUND_REFRESH_JITTER_MS = 60_000

export function createDashboard(runtime: Runtime, options: DashboardOptions): Dashboard {
  /** Mutable: re-read after an editor saves so changes show without a page reload. */
  let currentConfig = options.config
  const reg = createSourceRegistry(currentConfig, runtime)
  const activeTabByGroup = new Map<string, string>()
  let handle: OverlayHandle | null = null
  let cleanupDashboard: (() => void) | null = null
  let refreshIntervalId: number | null = null
  let backgroundTimerId: number | null = null
  let visibilityHandler: (() => void) | null = null
  /** Ids returned by `addValueChangeListener`, removed in `destroy()`. */
  const valueChangeIds: number[] = []
  let started = false
  let destroyed = false

  /** One-shot background timer with per-arm jitter, re-armed after each fire. */
  function scheduleBackgroundRefresh(): void {
    if (backgroundTimerId !== null) runtime.clearTimeout(backgroundTimerId)
    const delay = BACKGROUND_REFRESH_BASE_MS + Math.random() * BACKGROUND_REFRESH_JITTER_MS
    backgroundTimerId = runtime.setTimeout(() => {
      backgroundTimerId = null
      // Skip if the panel is open — the foreground interval handles refresh.
      if (!handle) {
        void doRunOpportunisticRefresh()
        scheduleBackgroundRefresh()
      }
    }, delay)
  }

  function clearBackgroundRefresh(): void {
    if (backgroundTimerId !== null) {
      runtime.clearTimeout(backgroundTimerId)
      backgroundTimerId = null
    }
  }

  function getRendererDeps(): GroupRendererDeps | null {
    if (!handle) return null
    return {
      runtime,
      handle,
      activeTabByGroup,
      sourceSettings: currentConfig.sourceSettings,
      refreshSource: (sourceId) => dashboard.refreshSource(sourceId),
      revertGroup: (groupId) => {
        if (!handle) return
        void renderGroupById(groupId, reg.groupById, reg.groupForSource, getRendererDeps()!)
      },
      showEditorDialog,
    }
  }

  // Track in-flight refreshes so that a user-triggered refresh waits for an
  // already-running opportunistic refresh instead of silently failing the
  // lock check and returning immediately (button stops spinning, no data).
  const inflightRefreshes = new Map<string, Promise<void>>()

  function refreshAndRerender(source: Source<unknown>): Promise<void> {
    const existing = inflightRefreshes.get(source.id)
    if (existing) {
      console.debug('[gm-dashboard] refreshAndRerender in-flight sourceId=', source.id)
      return existing
    }
    const promise = (async () => {
      try {
        await refreshSource(runtime, source)
        const group = reg.groupForSource.get(source.id)
        if (!group || !handle) return
        const deps = getRendererDeps()
        if (!deps) return
        await renderGroupById(group.id, reg.groupById, reg.groupForSource, deps)
      } finally {
        inflightRefreshes.delete(source.id)
      }
    })()
    inflightRefreshes.set(source.id, promise)
    return promise
  }

  async function doRefreshSource(sourceId: string): Promise<void> {
    console.debug('[gm-dashboard] refreshSource enter sourceId=', sourceId)
    // Editors save to storage and then trigger a refresh; re-read the config so
    // the new settings (tab title, badge, …) render without a page reload.
    currentConfig = await loadConfig(runtime)
    const source = findSource(reg.sources, sourceId) as Source<unknown> | undefined
    if (!source) {
      console.debug('[gm-dashboard] refreshSource source-not-found sourceId=', sourceId)
      return
    }
    await refreshAndRerender(source)
  }

  async function doRunOpportunisticRefresh(): Promise<void> {
    await runOpportunisticRefresh(runtime, reg.sources as Source<unknown>[], (source) =>
      refreshAndRerender(source),
    )
  }

  async function open(): Promise<OverlayHandle> {
    if (handle) return handle
    const mounted = mountDashboard({
      runtime,
      cardGroups: reg.cardGroups,
      sourceSettings: currentConfig.sourceSettings,
      dashboard: { close: () => dashboard.close() },
    })
    handle = mounted.handle
    cleanupDashboard = mounted.cleanup
    await Promise.all(reg.sources.map((s) => s.loadState?.(runtime)))
    const deps = getRendererDeps()
    if (deps) {
      await renderAllGroups(reg.cardGroups, reg.groupForSource, reg.groupById, deps)
    }
    void doRunOpportunisticRefresh()

    // Switch from background jitter timer to foreground 60s interval.
    clearBackgroundRefresh()
    visibilityHandler = () => {
      if (runtime.document.visibilityState === 'visible') {
        void doRunOpportunisticRefresh()
      }
    }
    runtime.document.addEventListener('visibilitychange', visibilityHandler)
    refreshIntervalId = runtime.setInterval(
      () => void doRunOpportunisticRefresh(),
      FOREGROUND_REFRESH_INTERVAL_MS,
    )
    return handle
  }

  function close(): void {
    if (!handle) return
    if (refreshIntervalId !== null) {
      runtime.clearInterval(refreshIntervalId)
      refreshIntervalId = null
    }
    if (visibilityHandler) {
      runtime.document.removeEventListener('visibilitychange', visibilityHandler)
      visibilityHandler = null
    }
    cleanupDashboard?.()
    cleanupDashboard = null
    handle.unmount()
    handle = null
    // Resume background jitter refresh now that the panel is closed.
    scheduleBackgroundRefresh()
  }

  function toggle(): void {
    if (handle) close()
    else void open()
  }

  const dashboard: Dashboard = {
    start: () => {
      if (started || destroyed) return
      started = true
      runtime.registerMenuCommand('打开仪表盘', () => {
        void dashboard.open()
      })
      reg.sources.forEach((source) => {
        const id = runtime.addValueChangeListener(
          CACHE_KEY(source.id),
          (_key, _oldValue, _newValue) => {
            if (!handle) return
            const group = reg.groupForSource.get(source.id)
            if (!group) return
            void renderGroupById(group.id, reg.groupById, reg.groupForSource, getRendererDeps()!)
          },
        )
        valueChangeIds.push(id)
      })
      bootstrapShortcut({
        runtime,
        config: currentConfig,
        onOpen: () => void dashboard.open(),
      })
      runtime.requestIdleCallback(
        () => {
          void doRunOpportunisticRefresh()
        },
        { timeout: 5000 },
      )
      // Start background refresh for when the panel is not open.
      scheduleBackgroundRefresh()
      bootstrapSync(runtime, reg.sources)
    },
    open,
    close,
    toggle,
    refreshSource: doRefreshSource,
    runOpportunisticRefresh: doRunOpportunisticRefresh,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      for (const id of valueChangeIds) {
        runtime.removeValueChangeListener(id)
      }
      valueChangeIds.length = 0
      clearBackgroundRefresh()
      close()
    },
  }
  return dashboard
}

export async function startDashboard(runtime: Runtime): Promise<void> {
  console.debug('[gm-dashboard] script loaded (debug build)')
  const config = await loadConfig(runtime)
  const dashboard = createDashboard(runtime, { config })
  dashboard.start()
}
