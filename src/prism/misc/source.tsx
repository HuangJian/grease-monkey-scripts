import type { Runtime } from '../../runtime'
import type { Source, SourceSettings } from '../types'
import type { MiscData, MiscOptions } from './types'
import { fetchOpenRouterModels } from './openrouter/fetcher'
import { OpenRouterWidget } from './openrouter/widget'
import { createMiscEditor, loadFreshMiscOptions } from './editor'
import { OPENROUTER_CACHE_KEY } from '../keys'

const DEFAULT_MISC_OPTIONS: MiscOptions = { ttlMinutes: 10 }

async function fetchWithCache<TData>(
  fetchData: (runtime: Runtime) => Promise<TData>,
  runtime: Runtime,
  cacheKey: string,
): Promise<{ data: TData | null; error: string | null }> {
  try {
    const data = await fetchData(runtime)
    Promise.resolve(runtime.setValue(cacheKey, data)).catch(() => {
      console.warn('[gm-dashboard] misc cache write failed', cacheKey)
    })
    return { data, error: null }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    let data: TData | null = null
    try {
      data = await runtime.getValue<TData | null>(cacheKey, null)
    } catch (err) {
      console.debug('[gm-dashboard] misc cache read error', err)
    }
    return { data, error }
  }
}

export function createMiscSource(runtime: Runtime): Source<MiscData, 'misc'> {
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
    // 省略 loadState：无预载状态（AGENTS.md 可选字段省略约定；exactOptionalPropertyTypes 下不显式赋值 undefined）
    RenderComponent: ({ data }) => {
      const openrouter = data?.openrouter ?? { data: null, error: null }

      return (
        <div class="gm-sp-misc-grid">
          <div class="gm-sp-misc-card">
            <OpenRouterWidget {...openrouter} />
          </div>
        </div>
      )
    },
    async fetch(_runtime, _prevData) {
      const r = runtime
      await loadMiscOptions()
      const openrouter = await fetchWithCache(fetchOpenRouterModels, r, OPENROUTER_CACHE_KEY)
      return { openrouter }
    },
    createEditor(settings: SourceSettings) {
      return createMiscEditor(miscOptions, settings)
    },
  }
}
