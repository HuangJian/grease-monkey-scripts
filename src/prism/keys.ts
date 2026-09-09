export const KEY_PREFIX = 'dashboard:v2'

/**
 * Key-space prefixes. Exported so consumers can classify / parse keys instead of
 * re-deriving the format locally — `save-filter.ts` used to rebuild these three,
 * which would silently desync if the key layout ever changed (§2.2).
 */
export const CACHE_KEY_PREFIX = `${KEY_PREFIX}:`
export const STATE_KEY_PREFIX = `${KEY_PREFIX}:state:`
export const LOCK_KEY_PREFIX = `${KEY_PREFIX}:lock:`

export const CACHE_KEY = (sourceId: string): string => `${CACHE_KEY_PREFIX}${sourceId}`
export const STATE_KEY = (sourceId: string): string => `${STATE_KEY_PREFIX}${sourceId}`
export const LOCK_KEY = (sourceId: string): string => `${LOCK_KEY_PREFIX}${sourceId}`
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
