import type { Runtime } from '../runtime'
import { CONFIG_KEY, type Config } from './types'
import { XIT_CACHE_KEY, XIT_CACHE_STORAGE_KEY, XIT_FILTERS_KEY } from './keys'
import { loadCache, saveCache } from './cache'
import { deepMerge } from './config'
import { validateConfig } from './config'
import type { CachedSource } from './types'
import type { XitData, NamedFilterStore } from './xit/types'

type ExportData = Record<string, unknown>

export async function buildExportData(runtime: Runtime): Promise<ExportData> {
  const result: ExportData = {}

  const config = await runtime.getValue<unknown>(CONFIG_KEY, null)
  if (config !== null && config !== undefined) {
    result[CONFIG_KEY] = config
  }

  const xitCached = await loadCache<XitData>(runtime, XIT_CACHE_KEY)
  if (xitCached !== null) {
    result[XIT_CACHE_STORAGE_KEY] = xitCached
  }

  const filters = await runtime.getValue<unknown>(XIT_FILTERS_KEY, null)
  if (filters !== null && filters !== undefined) {
    result[XIT_FILTERS_KEY] = filters
  }

  return result
}

export function downloadJson(runtime: Runtime, data: ExportData, filename: string): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = runtime.document.createElement('a')
  a.href = url
  a.download = filename
  runtime.document.body.appendChild(a)
  a.click()
  runtime.document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function readImportFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result as string))
      } catch (e) {
        reject(new Error('JSON 解析失败：' + (e instanceof Error ? e.message : String(e))))
      }
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

type ImportValidation = { ok: true } | { ok: false; error: string }

export function validateImportData(data: unknown): ImportValidation {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: '导入数据必须是 JSON 对象' }
  }

  const obj = data as Record<string, unknown>
  const knownKeys = [CONFIG_KEY, XIT_CACHE_STORAGE_KEY, XIT_FILTERS_KEY]
  const hasKnownKey = knownKeys.some((k) => k in obj)
  if (!hasKnownKey) {
    return { ok: false, error: '导入数据不包含任何已知的配置键' }
  }

  if (CONFIG_KEY in obj) {
    const merged = deepMerge({} as Config, obj[CONFIG_KEY])
    const validation = validateConfig(merged)
    if (!validation.ok) {
      return { ok: false, error: '配置校验失败：' + validation.error }
    }
  }

  if (XIT_CACHE_STORAGE_KEY in obj) {
    const xit = obj[XIT_CACHE_STORAGE_KEY]
    if (typeof xit !== 'object' || xit === null || Array.isArray(xit)) {
      return { ok: false, error: 'xit 数据必须是对象' }
    }
    const cached = xit as CachedSource<XitData>
    if (typeof cached.schemaVersion !== 'number') {
      return { ok: false, error: 'xit 数据缺少 schemaVersion' }
    }
    if (!cached.data || typeof (cached.data as XitData).text !== 'string') {
      return { ok: false, error: 'xit 数据缺少 data.text' }
    }
  }

  if (XIT_FILTERS_KEY in obj) {
    const store = obj[XIT_FILTERS_KEY]
    if (typeof store !== 'object' || store === null || Array.isArray(store)) {
      return { ok: false, error: 'xit-filters 必须是对象' }
    }
    const filterStore = store as NamedFilterStore
    if (!Array.isArray(filterStore.filters)) {
      return { ok: false, error: 'xit-filters.filters 必须是数组' }
    }
  }

  return { ok: true }
}

export async function applyImportData(runtime: Runtime, data: ExportData): Promise<void> {
  if (CONFIG_KEY in data) {
    const existing = await runtime.getValue<unknown>(CONFIG_KEY, null)
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Config)
        : ({} as Config)
    const merged = deepMerge(base, data[CONFIG_KEY])
    const validation = validateConfig(merged)
    if (!validation.ok) {
      throw new Error('配置校验失败：' + validation.error)
    }
    await runtime.setValue(CONFIG_KEY, merged)
  }

  if (XIT_CACHE_STORAGE_KEY in data) {
    const cached = data[XIT_CACHE_STORAGE_KEY] as CachedSource<XitData>
    await saveCache(runtime, XIT_CACHE_KEY, {
      data: cached.data,
      fetchedAt: cached.fetchedAt ?? Date.now(),
      error: '',
    })
  }

  if (XIT_FILTERS_KEY in data) {
    await runtime.setValue(XIT_FILTERS_KEY, data[XIT_FILTERS_KEY])
  }
}

export function formatExportFilename(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `gm-dashboard-export-${yyyy}-${mm}-${dd}.json`
}
