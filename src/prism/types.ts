import type { ComponentType, VNode } from 'preact'
import type { Runtime } from '../runtime'
import { KEY_PREFIX, CACHE_KEY, STATE_KEY, LOCK_KEY, CONFIG_KEY } from './keys'

export { KEY_PREFIX, CACHE_KEY, STATE_KEY, LOCK_KEY, CONFIG_KEY }

export const LOCK_TTL_MS = 180_000
export const LOCK_VERIFY_DELAY_MS = 50

export const VERY_STALE_MULTIPLIER = 3
export const CACHE_SCHEMA_VERSION = 2
/** Per-source data codec format version (tracks compressed-item shapes). */
export const CACHE_CODEC_VERSION = 1

/** Consecutive-failure backoff delays (1m, 2m, 5m, 10m cap). */
export const BACKOFF_DELAYS_MS = [60_000, 120_000, 300_000, 600_000] as const

export type Lock = { owner: string; expiresAt: number }

export type CachedSource<T> = {
  schemaVersion: number
  /** Codec format used to compress `data`; absent means legacy (v1/v0 sniffable). */
  codecVersion?: number
  data: T | null
  fetchedAt: number
  error: string
  /** Timestamp of the last fetch attempt (set on failure; on success fetchedAt suffices). */
  attemptedAt?: number
  /** Earliest time an automatic refresh should retry after consecutive failures. */
  nextRetryAt?: number | undefined
  /** Number of consecutive fetch failures (reset on success). */
  failureCount?: number
}

import type { WeatherCity } from './weather/types'
import type { NovelBookConfig } from './novels/types'
import type { TnewsConfig } from './tnews/types'
import type { MiscOptions } from './misc/types'
import type { XueqiuSourceOptions } from './xueqiu/types'

// Data types for the §2.6 `AnySource` discriminated union (single source of truth).
import type { V2exTopic } from './v2ex/types'
import type { WeatherData } from './weather/types'
import type { NovelData } from './novels/types'
import type { RedditRenderData } from './reddit/source'
import type { HupuRenderData } from './hupu/source'
import type { TnewsItem } from './tnews/types'
import type { XueqiuRenderData } from './xueqiu/types'
import type { XitData } from './xit/types'
import type { MiscData } from './misc/types'

export type RedditConfig = {
  ttlMinutes: number
  retentionDays: number
  todayMinComments: number
  olderMinComments: number
  ageHalfLifeDays: number
  subreddits: string[]
}

export type HupuConfig = {
  ttlMinutes: number
  retentionDays: number
  boards: string[]
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
    retentionDays: number
    todayMinReplies: number
    olderMinReplies: number
    ageHalfLifeDays: number
  }
  reddit: RedditConfig
  hupu: HupuConfig
  novels: {
    books: NovelBookConfig[]
    ttlMinutes: number
    initialNewChapters: number
    maxNewChaptersPerBook: number
    maxLatestWindow: number
  }
  tnews: TnewsConfig
  xueqiu: XueqiuSourceOptions
  misc?: MiscOptions
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

export const VALID_BADGE_TYPES = [
  'default',
  'none',
  'allUnread',
  'todayUnread',
  'subBoardUpdate',
] as const
export type BadgeType = (typeof VALID_BADGE_TYPES)[number]

export type SourceSettings = {
  tabTitle: string
  priority: number
  badgeType: BadgeType
}

export type SourceComponentProps<T> = {
  data: T | null
  /**
   * Element to query for DOM lookups (scroll-into-view in expandable lists).
   * A ShadowRoot when mounted in the card chrome; a plain container in previews.
   */
  root: ShadowRoot | HTMLElement
  runtime: Runtime
  onNotify?: (() => void) | undefined
}

export type SourceHeaderProps<T> = {
  data: T | null
  cached: CachedSource<T> | null
  now: number
  ttlMs: number
  runtime: Runtime
  root: ShadowRoot
  onRefresh: () => Promise<void>
  onEdit?: (() => void) | undefined
}

export type Source<T, Id extends string = string> = {
  readonly id: Id
  readonly title: string
  readonly ttlMs: number
  /**
   * When true, the source is considered stale once the local calendar day
   * (browser timezone) of its last fetch differs from today — so it refreshes
   * after local midnight each day instead of on a fixed TTL. Used by local
   * sources (e.g. xit) whose refresh carries a daily recurring-task reset.
   */
  readonly refreshDailyAtLocalMidnight?: boolean
  readonly placement?: 'main' | 'side'
  readonly groupId?: string
  readonly order?: number
  readonly getTabLabel?: ((data: T | null) => TabLabel) | undefined
  readonly dialogTitle?: string | VNode
  readonly hideHeaderActions?: boolean
  readonly RenderHeader?: ComponentType<SourceHeaderProps<T>>
  readonly RenderComponent: ComponentType<SourceComponentProps<T>>
  fetch(runtime: Runtime, prevData?: T): Promise<T>
  loadState?(runtime: Runtime): Promise<void>
  createEditor?: (settings: SourceSettings) => SourceEditor
}

/**
 * §2.6 discriminated union: the registry holds one of these per source, each
 * member keeping its concrete data type `T` and literal `id`. Unlike the old
 * `Source<unknown>[]` (which erased `T` at the registry boundary), a consumer
 * can recover `T` by narrowing on `source.id`. `Id` defaults to `string` so
 * every other `Source<X>` usage in the codebase is unchanged.
 */
export type AnySource =
  | Source<V2exTopic[], 'v2ex'>
  | Source<WeatherData, 'weather'>
  | Source<NovelData, 'novels'>
  | Source<RedditRenderData, 'reddit'>
  | Source<HupuRenderData, 'hupu'>
  | Source<TnewsItem[], 'tnews'>
  | Source<XueqiuRenderData, 'xueqiu-news'>
  | Source<XueqiuRenderData, 'xueqiu-hot'>
  | Source<XitData, 'xit'>
  | Source<MiscData, 'misc'>

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

/**
 * Single, type-safe cache-read erasure point (§2.6). Given a (possibly
 * narrowed) `Source<T>`, recovers `T | null` from a `CachedSource<unknown>`
 * without scattering `as T | null` / `as unknown` across the render layer.
 * When `source` is a discriminated-union member (e.g. after `findSource` +
 * `id` narrowing), `T` is the source's real data type; in a heterogeneous
 * `CardGroup` loop `T` degenerates to the union and the cast degrades to
 * `as unknown` — which is the inherent erasure documented in S8.plan.md §1.7.
 */
export function readSourceData<T, Id extends string>(
  _source: Source<T, Id>,
  cached: CachedSource<unknown> | null,
): T | null {
  return (cached?.data ?? null) as T | null
}
