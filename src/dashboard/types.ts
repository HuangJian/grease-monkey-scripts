import type { ComponentType, VNode } from 'preact'
import type { Runtime } from '../runtime'

export const KEY_PREFIX = 'dashboard:v2'

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
  error?: string
}

import type { WeatherCity } from './weather/types'
import type { NovelEntry } from './novels/types'
import type { TnewsConfig } from './tnews/types'
import type { XueqiuSourceOptions } from './xueqiu/types'

export type RedditConfig = {
  ttlMinutes: number
  historyDays: number
  todayMinComments: number
  olderMinComments: number
  ageHalfLifeDays: number
  subreddits: string[]
}

export type HupuConfig = {
  ttlMinutes: number
  boards: string[]
  historyDays: number
  todayMinReplies: number
  olderMinReplies: number
  ageHalfLifeDays: number
  lightsWeight: number
  repliesWeight: number
}

export type Config = {
  weather: {
    cities: WeatherCity[]
    ttlMinutes: number
  }
  v2ex: {
    ttlMinutes: number
    historyDays: number
    todayMinReplies: number
    olderMinReplies: number
    ageHalfLifeDays: number
  }
  reddit: RedditConfig
  hupu: HupuConfig
  novels: {
    entries: NovelEntry[]
    ttlMinutes: number
    initialNewChapters: number
    maxNewChaptersPerBook: number
    maxLatestWindow: number
  }
  tnews: TnewsConfig
  xueqiu: XueqiuSourceOptions
  xit: {
    enabled: boolean
    placement: 'main' | 'side'
  }
  shortcut: {
    doublePressWindowMs: number
    enabled: boolean
  }
  hostAllowlist: string[]
  sourceSettings: Record<string, SourceSettings>
}

export type SourceEditorContext = {
  runtime: Runtime
  onRevert: () => void
  refresh?: () => void
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

export type BadgeType = 'default' | 'none' | 'allUnread' | 'todayUnread' | 'subBoardUpdate'

export type SourceSettings = {
  tabTitle: string
  priority: number
  badgeType: BadgeType
}

export type SourceComponentProps<T> = {
  data: T | null
  root?: ShadowRoot
  runtime?: Runtime
  onNotify?: () => void
  onHeaderChange?: () => void
}

export type SourceHeaderProps<T> = {
  data: T | null
  cached: CachedSource<T> | null
  now: number
  ttlMs: number
  runtime: Runtime
  root: ShadowRoot
  onRefresh: () => Promise<void>
  onEdit?: () => void
  onHeaderChange?: () => void
}

export type Source<T> = {
  readonly id: string
  readonly title: string
  readonly ttlMs: number
  readonly placement?: 'main' | 'side'
  readonly groupId?: string
  readonly order?: number
  readonly getTabLabel?: (data: any) => TabLabel
  readonly dialogTitle?: string | VNode
  readonly hideHeaderActions?: boolean
  readonly RenderHeader?: ComponentType<SourceHeaderProps<any>>
  readonly RenderComponent?: ComponentType<SourceComponentProps<any>>
  headerState?: Record<string, unknown>
  fetch(runtime: Runtime, prevData?: T): Promise<T>
  loadState?(runtime: Runtime): Promise<void>
  createEditor?: (settings: SourceSettings) => SourceEditor
}

export const DEFAULT_SOURCE_SETTINGS: SourceSettings = {
  tabTitle: '',
  priority: 0,
  badgeType: 'default',
}

export function getSourceSettings(
  all: Record<string, SourceSettings> | undefined,
  sourceId: string,
): SourceSettings {
  return all?.[sourceId] ?? DEFAULT_SOURCE_SETTINGS
}
