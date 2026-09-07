// Aggregated configuration types. This module is the sanctioned composition
// root for the config shape; it is allowed to import feature config types. The
// inverse direction (feature dirs importing core `../types`) is what keeps
// `../types` a leaf — this file does NOT get re-exported from `../types`, so
// importing `Config` here never pulls feature types back into the core leaf.

import type { SourceSettings } from '../types'
import type { WeatherCity } from '../weather/types'
import type { NovelBookConfig } from '../novels/types'
import type { TnewsConfig } from '../tnews/types'
import type { MiscOptions } from '../misc/types'
import type { XueqiuSourceOptions } from '../xueqiu/types'

export type { WeatherCity } from '../weather/types'
export type { NovelBookConfig } from '../novels/types'
export type { TnewsConfig } from '../tnews/types'
export type { MiscOptions } from '../misc/types'
export type { XueqiuSourceOptions } from '../xueqiu/types'

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
