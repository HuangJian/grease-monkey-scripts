import type { Runtime } from '../../runtime'
import { CACHE_KEY, type Config, type Source } from '../types'
import { loadConfig } from '../config'
import { createSourceRegistry, findSource } from './source-registry'
import { renderAllGroups, renderGroupById, type GroupRendererDeps } from './group-renderer'
import { refreshSource, runOpportunisticRefresh } from './refresh'
import { editConfig } from './config-editor'
import { mountDashboard } from './lifecycle'
import { bootstrapShortcut } from './shortcut-bootstrap'
import { bootstrapSync } from './sync-bootstrap'
import type { OverlayHandle } from '../shell/mount'

export { isHostAllowed } from './host-allowlist'

export type DashboardOptions = {
  config: Config
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
  const reg = createSourceRegistry(options.config, runtime)
  const activeTabByGroup = new Map<string, string>()
  let handle: OverlayHandle | null = null
  let cleanupDashboard: (() => void) | null = null
  let refreshIntervalId: ReturnType<typeof setInterval> | null = null
  let visibilityHandler: (() => void) | null = null

  function getRendererDeps(): GroupRendererDeps | null {
    if (!handle) return null
    return {
      runtime,
      handle,
      activeTabByGroup,
      sourceSettings: options.config.sourceSettings,
      refreshSource: (sourceId) => dashboard.refreshSource(sourceId),
      revertGroup: (groupId) => {
        if (!handle) return
        void renderGroupById(groupId, reg.groupById, reg.groupForSource, getRendererDeps()!)
      },
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
    const source = findSource(reg.sources, sourceId)
    if (!source) {
      console.debug('[gm-dashboard] refreshSource source-not-found sourceId=', sourceId)
      return
    }
    await refreshAndRerender(source)
  }

  async function doRunOpportunisticRefresh(): Promise<void> {
    await runOpportunisticRefresh(runtime, reg.sources, (source) => refreshAndRerender(source))
  }

  async function open(): Promise<void> {
    if (handle) return
    const mounted = mountDashboard({
      runtime,
      cardGroups: reg.cardGroups,
      sourceSettings: options.config.sourceSettings,
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

    // Background refresh runs only while the overlay is open — no point
    // consuming resources when nobody is looking at the dashboard.
    visibilityHandler = () => {
      if (runtime.document.visibilityState === 'visible') {
        void doRunOpportunisticRefresh()
      }
    }
    runtime.document.addEventListener('visibilitychange', visibilityHandler)
    refreshIntervalId = setInterval(() => void doRunOpportunisticRefresh(), 60_000)
  }

  function close(): void {
    if (!handle) return
    if (refreshIntervalId !== null) {
      clearInterval(refreshIntervalId)
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
  }

  function toggle(): void {
    if (handle) close()
    else void open()
  }

  const dashboard: Dashboard = {
    start: () => {
      runtime.registerMenuCommand('打开仪表盘', () => {
        void dashboard.open()
      })
      runtime.registerMenuCommand('编辑仪表盘配置', () => dashboard.editConfig())
      reg.sources.forEach((source) => {
        runtime.addValueChangeListener(CACHE_KEY(source.id), (_key, _oldValue, _newValue) => {
          if (!handle) return
          const group = reg.groupForSource.get(source.id)
          if (!group) return
          void renderGroupById(group.id, reg.groupById, reg.groupForSource, getRendererDeps()!)
        })
      })
      bootstrapShortcut({
        runtime,
        config: options.config,
        onOpen: () => void dashboard.open(),
      })
      runtime.requestIdleCallback(
        () => {
          void doRunOpportunisticRefresh()
        },
        { timeout: 5000 },
      )
      bootstrapSync(runtime, reg.sources)
    },
    open,
    close,
    toggle,
    refreshSource: doRefreshSource,
    runOpportunisticRefresh: doRunOpportunisticRefresh,
    editConfig: () => editConfig(runtime, options.config),
  }
  return dashboard
}

export async function startDashboard(runtime: Runtime): Promise<void> {
  console.debug('[gm-dashboard] script loaded (debug build)')
  const config = await loadConfig(runtime)
  const dashboard = createDashboard(runtime, { config })
  dashboard.start()
}
