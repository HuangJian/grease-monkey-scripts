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

  async function refreshAndRerender(source: Source<unknown>): Promise<void> {
    await refreshSource(runtime, source)
    const group = reg.groupForSource.get(source.id)
    if (!group || !handle) return
    const deps = getRendererDeps()
    if (!deps) return
    await renderGroupById(group.id, reg.groupById, reg.groupForSource, deps)
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
    handle = mountDashboard({
      runtime,
      cardGroups: reg.cardGroups,
      activeTabByGroup,
      groupForSource: reg.groupForSource,
      sourceSettings: options.config.sourceSettings,
      dashboard: {
        close: () => dashboard.close(),
        refreshSource: (sourceId) => dashboard.refreshSource(sourceId),
      },
      renderGroupById: (groupId) => {
        const deps = getRendererDeps()
        if (deps) void renderGroupById(groupId, reg.groupById, reg.groupForSource, deps)
      },
    })
    await Promise.all(reg.sources.map((s) => s.loadState?.(runtime)))
    const deps = getRendererDeps()
    if (deps) {
      await renderAllGroups(reg.cardGroups, reg.groupForSource, reg.groupById, deps)
    }
    void doRunOpportunisticRefresh()
  }

  function close(): void {
    if (!handle) return
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
      for (const source of reg.sources) {
        runtime.addValueChangeListener(CACHE_KEY(source.id), (_key, _oldValue, _newValue) => {
          if (!handle) return
          const group = reg.groupForSource.get(source.id)
          if (!group) return
          void renderGroupById(group.id, reg.groupById, reg.groupForSource, getRendererDeps()!)
        })
      }
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
      setInterval(() => void doRunOpportunisticRefresh(), 60_000)
      runtime.document.addEventListener('visibilitychange', () => {
        if (runtime.document.visibilityState === 'visible') {
          void doRunOpportunisticRefresh()
        }
      })
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
