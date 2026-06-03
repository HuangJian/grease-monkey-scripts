import type { Runtime } from '../runtime'
import { isStale, loadCache, saveCache } from './cache'
import { tryAcquireLock } from './lock'
import { mountOverlay, type OverlayHandle } from './overlay/mount'
import { renderCard, renderHeader } from './overlay/render'
import { createDoubleShiftHandler, isEditableTarget } from './shortcut'
import { createV2exSource } from './sources/v2ex'
import { createWeatherSource } from './sources/weather'
import type { Source } from './sources/types'
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
  const sources: Source<unknown>[] = [
    createV2exSource(options.config.v2ex),
    createWeatherSource(options.config.weather),
  ]
  let handle: OverlayHandle | null = null
  let mountedUnmount: (() => void) | null = null

  function findSource(id: string): Source<unknown> | undefined {
    return sources.find((s) => s.id === id)
  }

  function cardForSource(root: ShadowRoot, sourceId: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-source="${sourceId}"]`)
  }

  function placementFor(source: Source<unknown>): 'main' | 'side' {
    return source.placement === 'side' ? 'side' : 'main'
  }

  async function readAllCaches(): Promise<Map<string, CachedSource<unknown> | null>> {
    const map = new Map<string, CachedSource<unknown> | null>()
    await Promise.all(
      sources.map(async (s) => {
        map.set(s.id, await loadCache<unknown>(runtime, s.id))
      }),
    )
    return map
  }

  function revertCard(sourceId: string): void {
    if (!handle) return
    const source = findSource(sourceId)
    if (!source) return
    void loadCache<unknown>(runtime, sourceId).then((cached) => {
      renderCardById(sourceId, cached, Date.now())
    })
  }

  function renderAllCards(caches: Map<string, CachedSource<unknown> | null>, now: number): void {
    if (!handle) return
    for (const source of sources) {
      const card = cardForSource(handle.root, source.id)
      if (!card) continue
      renderCard(card, {
        source,
        cached: caches.get(source.id) ?? null,
        ttlMs: source.ttlMs,
        now,
        runtime,
        onRefresh: () => {
          void dashboard.refreshSource(source.id)
        },
        onRevert: () => revertCard(source.id),
      })
    }
  }

  function renderCardById(
    sourceId: string,
    cached: CachedSource<unknown> | null,
    now: number,
  ): void {
    if (!handle) return
    const source = findSource(sourceId)
    if (!source) return
    const card = cardForSource(handle.root, sourceId)
    if (!card) return
    renderCard(card, {
      source,
      cached,
      ttlMs: source.ttlMs,
      now,
      runtime,
      onRefresh: () => {
        void dashboard.refreshSource(sourceId)
      },
      onRevert: () => revertCard(sourceId),
    })
  }

  async function refreshSource(sourceId: string): Promise<void> {
    const source = findSource(sourceId)
    if (!source) return
    const acquired = await tryAcquireLock(runtime, sourceId)
    if (!acquired) return
    const oldCache = await loadCache<unknown>(runtime, sourceId)
    let next: Omit<CachedSource<unknown>, 'schemaVersion' | 'byteSize'> | null = null
    try {
      const data = await source.fetch(runtime)
      next = { data, fetchedAt: Date.now() }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      next = {
        data: oldCache?.data,
        fetchedAt: oldCache?.fetchedAt ?? Date.now(),
        error: message,
      }
    }
    if (!next) return
    const result = await saveCache(runtime, sourceId, next)
    if (result === 'quota_exceeded') {
      next = {
        data: oldCache?.data,
        fetchedAt: oldCache?.fetchedAt ?? Date.now(),
        error: 'quota_exceeded',
      }
      await saveCache(runtime, sourceId, next)
    }
    renderCardById(sourceId, await loadCache<unknown>(runtime, sourceId), Date.now())
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
    for (const source of sources) {
      const card = runtime.document.createElement('div')
      card.className = 'gm-sp-card'
      const container = placementFor(source) === 'side' ? newHandle.sideCards : newHandle.mainCards
      container.appendChild(card)
      renderCard(card, {
        source,
        cached: null,
        ttlMs: source.ttlMs,
        now: Date.now(),
        runtime,
        onRefresh: () => {
          void dashboard.refreshSource(source.id)
        },
        onRevert: () => revertCard(source.id),
      })
    }
  }

  async function open(): Promise<void> {
    mount()
    const caches = await readAllCaches()
    renderAllCards(caches, Date.now())
    void runOpportunisticRefresh()
  }

  function close(): void {
    if (!handle) return
    mountedUnmount?.()
    handle = null
    mountedUnmount = null
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
        runtime.addValueChangeListener(CACHE_KEY(source.id), (_key, _oldValue, newValue) => {
          if (!handle) return
          renderCardById(source.id, (newValue as CachedSource<unknown> | null) ?? null, Date.now())
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
  const config = await loadConfig(runtime)
  const dashboard = createDashboard(runtime, { config })
  dashboard.start()
}
