import type { Runtime } from '../runtime'

export const KEY_PREFIX = 'dashboard:v1'

export const CACHE_KEY = (sourceId: string): string => `${KEY_PREFIX}:${sourceId}`
export const LOCK_KEY = (sourceId: string): string => `${KEY_PREFIX}:lock:${sourceId}`
export const CONFIG_KEY = `${KEY_PREFIX}:config`

export const LOCK_TTL_MS = 90_000
export const LOCK_VERIFY_DELAY_MS = 50

export const VERY_STALE_MULTIPLIER = 3
export const CACHE_SCHEMA_VERSION = 2
export const CACHE_QUOTA_BYTES = 50 * 1024

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

export type RedditConfig = {
  ttlMinutes: number
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

export type SourceEditor = (
  container: HTMLElement,
  ctx: SourceEditorContext,
) => void | Promise<void>

export type TabLabel = { label: string; badge?: string | number | null }

export type Source<T> = {
  readonly id: string
  readonly title: string
  readonly ttlMs: number
  readonly placement?: 'main' | 'side'
  readonly groupId?: string
  readonly order?: number
  readonly getTabLabel?: (data: any) => TabLabel
  fetch(runtime: Runtime, prevData?: T): Promise<T>
  render(container: HTMLElement, data: T | null): void
  customizeHeader?(titleContainer: HTMLElement, data: T | null): void
  createEditor?: () => SourceEditor
}

export function resolveTtl<T>(source: Source<T>, ttlMinutes: number): number {
  return ttlMinutes * 60_000
}
