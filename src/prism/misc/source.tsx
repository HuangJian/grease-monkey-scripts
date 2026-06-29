import type { Runtime } from '../../runtime'
import type { Source, SourceSettings, TabLabel } from '../types'
import type { MiscData, MiscOptions } from './types'
import { loadCodexConfig, fetchCodexUsage, saveCodexConfig } from './codex/fetcher'
import {
  loadAntigravityConfig,
  fetchAntigravityQuota,
  saveAntigravityConfig,
} from './antigravity/fetcher'
import { fetchOpenRouterModels } from './openrouter/fetcher'
import { loadTraeConfig, fetchTraeData, saveTraeConfig } from './trae/fetcher'
import { CodexWidget } from './codex/widget'
import { AntigravityWidget } from './antigravity/widget'
import { OpenRouterWidget } from './openrouter/widget'
import { TraeWidget } from './trae/widget'
import { createMiscEditor, loadFreshMiscOptions } from './editor'
import { pickBest } from './antigravity/widget'

const CACHE_KEY_CODEX = 'gm:misc:codex:cache'
const CACHE_KEY_ANTIGRAVITY = 'gm:misc:antigravity:cache'
const CACHE_KEY_OPENROUTER = 'gm:misc:openrouter:cache'
const CACHE_KEY_TRAE = 'gm:misc:trae:cache'

const DEFAULT_MISC_OPTIONS: MiscOptions = { ttlMinutes: 10, badgeType: 'none' }

async function fetchWithCache<TConfig, TData>(
  loadConfig: (runtime: Runtime) => Promise<TConfig | null>,
  fetchData: (runtime: Runtime, config: TConfig) => Promise<TData>,
  runtime: Runtime,
  cacheKey: string,
): Promise<{ config: TConfig | null; data: TData | null; error: string | null }> {
  let config: TConfig | null = null
  try {
    config = await loadConfig(runtime)
    if (!config) return { config: null, data: null, error: null }
  } catch {
    return { config: null, data: null, error: 'config load failed' }
  }
  try {
    const data = await fetchData(runtime, config)
    Promise.resolve(runtime.setValue(cacheKey, data)).catch(() => {
      console.warn('[gm-dashboard] misc cache write failed', cacheKey)
    })
    return { config, data, error: null }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    let data: TData | null = null
    try {
      data = await runtime.getValue<TData | null>(cacheKey, null)
    } catch (err) {
      console.debug('[gm-dashboard] misc cache read error', err)
    }
    return { config, data, error }
  }
}

async function fetchWithCacheNoConfig<TData>(
  fetchData: (runtime: Runtime) => Promise<TData>,
  runtime: Runtime,
  cacheKey: string,
): Promise<{ config: null; data: TData | null; error: string | null }> {
  try {
    const data = await fetchData(runtime)
    Promise.resolve(runtime.setValue(cacheKey, data)).catch(() => {
      console.warn('[gm-dashboard] misc cache write failed', cacheKey)
    })
    return { config: null, data, error: null }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    let data: TData | null = null
    try {
      data = await runtime.getValue<TData | null>(cacheKey, null)
    } catch (err) {
      console.debug('[gm-dashboard] misc cache read error', err)
    }
    return { config: null, data, error }
  }
}

function countQuota(data: MiscData | null, threshold: number): number {
  if (!data) return 0
  let count = 0
  const codex = data.codex?.data
  if (codex) {
    const usedPct = codex.rate_limit.primary_window?.used_percent ?? 0
    if (100 - usedPct >= threshold) count++
  }
  const antigravity = data.antigravity?.data
  if (antigravity) {
    const claude = pickBest(antigravity.models, /claude.*opus/i)
    const flash = pickBest(antigravity.models, /gemini.*flash/i)
    if (claude && claude.remainingPercent >= threshold) count++
    if (flash && flash.remainingPercent >= threshold) count++
  }
  const trae = data.trae?.data
  if (trae) {
    const active = trae.packs.filter((p) => p.status === 1)
    const target = active.length > 0 ? active[0] : trae.packs[0]
    if (target) {
      for (const q of target.quotas) {
        const pct = q.limit > 0 ? Math.max(0, (q.remaining / q.limit) * 100) : 0
        if (pct >= threshold) count++
      }
    }
  }
  return count
}

export function createMiscSource(runtime: Runtime): Source<MiscData> {
  let miscOptions: MiscOptions = { ...DEFAULT_MISC_OPTIONS }

  async function loadMiscOptions(): Promise<void> {
    miscOptions = await loadFreshMiscOptions(runtime, DEFAULT_MISC_OPTIONS)
  }

  void loadMiscOptions()
  return {
    id: 'misc',
    title: 'Misc',
    get ttlMs() {
      return miscOptions.ttlMinutes * 60_000
    },
    groupId: 'browse',
    order: 10,
    getTabLabel(data: MiscData | null): TabLabel {
      const badge =
        miscOptions.badgeType === 'none' || !data
          ? null
          : countQuota(data, miscOptions.badgeType === 'pct50' ? 50 : 30)
      return { label: 'Misc', badge: badge && badge > 0 ? badge : null }
    },
    RenderComponent: ({ data, onNotify }) => {
      const codex = data?.codex ?? { config: null, data: null, error: null }
      const antigravity = data?.antigravity ?? { config: null, data: null, error: null }
      const openrouter = {
        data: data?.openrouter?.data ?? null,
        error: data?.openrouter?.error ?? null,
      }
      const trae = data?.trae ?? { config: null, data: null, error: null }

      const onCodexConfigure = makeConfigure(
        runtime,
        saveCodexConfig,
        onNotify,
        '输入 Codex Bearer Token（从 https://chatgpt.com 的开发者工具中获取）:',
        (v) => ({ token: v.replace(/^Bearer\s+/i, '') }),
      )
      const onAntigravityConfigure = makeConfigure(
        runtime,
        saveAntigravityConfig,
        onNotify,
        '输入 Antigravity Refresh Token（从 Google OAuth 获取）:',
        (v) => ({ refreshToken: v }),
      )
      const onTraeConfigure = makeConfigure(
        runtime,
        saveTraeConfig,
        onNotify,
        '输入 Trae JWT Token（从 Trae 日志中提取）:',
        (v) => ({ token: v }),
      )

      return (
        <div class="gm-sp-misc-grid">
          <div class="gm-sp-misc-card">
            <CodexWidget {...codex} onConfigure={onCodexConfigure} />
          </div>
          <div class="gm-sp-misc-card">
            <AntigravityWidget {...antigravity} onConfigure={onAntigravityConfigure} />
          </div>
          <div class="gm-sp-misc-card">
            <OpenRouterWidget {...openrouter} />
          </div>
          <div class="gm-sp-misc-card">
            <TraeWidget {...trae} onConfigure={onTraeConfigure} />
          </div>
        </div>
      )
    },
    async fetch(_runtime, _prevData) {
      const r = runtime
      await loadMiscOptions()
      const [codex, antigravity, openrouter, trae] = await Promise.all([
        fetchWithCache(loadCodexConfig, fetchCodexUsage, r, CACHE_KEY_CODEX),
        fetchWithCache(loadAntigravityConfig, fetchAntigravityQuota, r, CACHE_KEY_ANTIGRAVITY),
        fetchWithCacheNoConfig(fetchOpenRouterModels, r, CACHE_KEY_OPENROUTER),
        fetchWithCache(loadTraeConfig, fetchTraeData, r, CACHE_KEY_TRAE),
      ])
      return { codex, antigravity, openrouter, trae }
    },
    createEditor(settings: SourceSettings) {
      return createMiscEditor(miscOptions, settings)
    },
  }
}

function makeConfigure<T>(
  runtime: Runtime,
  saveFn: (r: Runtime, config: T) => void,
  onNotify: (() => void) | undefined,
  promptMsg: string,
  toConfig: (input: string) => T,
): () => void {
  return () => {
    const input = runtime.prompt(promptMsg)
    if (!input) return
    saveFn(runtime, toConfig(input))
    onNotify?.()
  }
}
