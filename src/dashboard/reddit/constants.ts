export const REDDIT_USER_AGENT =
  'web:grease-monkey-dashboard:1.0 (contact: https://github.com/HuangJian/grease-monkey-scripts)'

export const REDDIT_HOSTS = ['old.reddit.com', 'www.reddit.com'] as const

export const REDDIT_API_URL = (host: string, sub: string): string =>
  `https://${host}/r/${encodeURIComponent(sub)}/hot.json?limit=100&raw_json=1`

export const MAX_RETRIES_ON_429 = 1

export const TOPIC_STATE_KEY = 'gm:reddit:topic-state'
export const TOPIC_STATE_TTL = 72 * 60 * 60 * 1000

export const HISTORY_KEY = 'gm:reddit:topics-history'
