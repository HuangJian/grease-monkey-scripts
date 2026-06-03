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

export type WeatherCity = {
  latitude: number
  longitude: number
  cityLabel: string
  cmaStationId?: string
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
    minCutoffReplies: number
  }
  shortcut: {
    doublePressWindowMs: number
    enabled: boolean
  }
  hostAllowlist: string[]
}
