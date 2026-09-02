export const KEY_PREFIX = 'dashboard:v2'

export const CACHE_KEY = (sourceId: string): string => `${KEY_PREFIX}:${sourceId}`
export const STATE_KEY = (sourceId: string): string => `${KEY_PREFIX}:state:${sourceId}`
export const LOCK_KEY = (sourceId: string): string => `${KEY_PREFIX}:lock:${sourceId}`
export const CONFIG_KEY = `${KEY_PREFIX}:config`

/** Cache key for the pre-grouped xueqiu news aggregate. Duplicates the
 * mainSource cache key; kept as its own named constant for export/import. */
export const XUEQIU_NEWS_CACHE_KEY = `${KEY_PREFIX}:xueqiu-news`
export const XUEQIU_HOT_CACHE_KEY = `${KEY_PREFIX}:xueqiu-hot`

export const XIT_CACHE_KEY = 'xit'
export const XIT_CACHE_STORAGE_KEY = `${KEY_PREFIX}:xit`
export const XIT_FILTERS_KEY = `${KEY_PREFIX}:xit-filters`
export const XIT_LAST_RESET_KEY = `${KEY_PREFIX}:xit-last-reset`

/** Namespace prefix for Prism-owned GM/localStorage keys. */
export const GM_PREFIX = 'gm:'
