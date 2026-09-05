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

// Non-Prism keys that still live under the `gm:` namespace, consolidated here
// so every storage key has a single source of truth (was §2.2 residue:
// `gm:misc:openrouter:cache`, `gm:xueqiu:ai-summaries`, reddit author tags).
export const OPENROUTER_CACHE_KEY = 'gm:misc:openrouter:cache'
export const XUEQIU_SUMMARIES_KEY = 'gm:xueqiu:ai-summaries'
export const REDDIT_AUTHOR_TAGS_KEY = 'reddit_author_tags'
export const REDDIT_AUTHOR_TAGS_LS_KEY = 'gm:reddit:author-tags'
