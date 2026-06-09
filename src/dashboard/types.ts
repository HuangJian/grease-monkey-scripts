import type { Runtime } from '../runtime'

export const KEY_PREFIX = 'dashboard:v1'

export const CACHE_KEY = (sourceId: string): string => `${KEY_PREFIX}:${sourceId}`
export const STATE_KEY = (sourceId: string): string => `${KEY_PREFIX}:state:${sourceId}`
export const LOCK_KEY = (sourceId: string): string => `${KEY_PREFIX}:lock:${sourceId}`
export const CONFIG_KEY = `${KEY_PREFIX}:config`

export const LOCK_TTL_MS = 90_000
export const LOCK_VERIFY_DELAY_MS = 50

export const VERY_STALE_MULTIPLIER = 3
export const CACHE_SCHEMA_VERSION = 2

export type Lock = { owner: string; expiresAt: number }

export type CachedSource<T> = {
  schemaVersion: number
  data?: T
  fetchedAt: number
  byteSize: number
  error?: string
}

import type { WeatherCity } from './weather/types'
import type { NovelEntry } from './novels/types'
import type { TnewsConfig } from './tnews/types'

export type RedditConfig = {
  ttlMinutes: number
  ageHalfLifeDays: number
  subreddits: string[]
  minItems: number
  maxItems: number
  minPerSub: number
  displayRatio: number
  elbowDropRatio: number
  minCutoffScore: number
}

export type Config = {
  weather: {
    cities: WeatherCity[]
    ttlMinutes: number
  }
  v2ex: {
    ttlMinutes: number
    minItems: number
    maxItems: number
    displayRatio: number
    elbowDropRatio: number
    minReplies: number
    ageHalfLifeDays: number
  }
  reddit: RedditConfig
  novels: {
    entries: NovelEntry[]
    ttlMinutes: number
    initialNewChapters: number
    maxNewChaptersPerBook: number
    maxLatestWindow: number
  }
  tnews: TnewsConfig
  xit: {
    enabled: boolean
    placement: 'main' | 'side'
  }
  shortcut: {
    doublePressWindowMs: number
    enabled: boolean
  }
  hostAllowlist: string[]
}

export type SourceEditorContext = {
  runtime: Runtime
  onRevert: () => void
  close: () => void
}

export type SourceEditorResult = {
  render: () => void
  save?: () => void | Promise<void>
  cancel?: () => void
}

export type SourceEditor = (
  container: HTMLElement,
  ctx: SourceEditorContext,
) => SourceEditorResult | Promise<SourceEditorResult>

export type TabLabel = { label: string; badge?: string | number | null }

export type Source<T> = {
  readonly id: string
  readonly title: string
  readonly ttlMs: number
  readonly placement?: 'main' | 'side'
  readonly groupId?: string
  readonly order?: number
  readonly getTabLabel?: (data: any) => TabLabel
  readonly headerContent?: string
  readonly hideDefaultHeader?: boolean
  readonly dialogTitle?: string
  fetch(runtime: Runtime, prevData?: T): Promise<T>
  render(
    container: HTMLElement,
    data: T | null,
    ctx?: { root?: ShadowRoot; runtime?: Runtime },
  ): void
  loadState?(runtime: Runtime): Promise<void>
  customizeHeader?(titleContainer: HTMLElement, data: T | null): void
  createEditor?: () => SourceEditor
}

export function resolveTtl<T>(source: Source<T>, ttlMinutes: number): number {
  return ttlMinutes * 60_000
}
