import type { Config } from '../config/types'
import {
  DEFAULT_MAX_ITEMS_PER_FEED,
  DEFAULT_RETENTION_DAYS,
  DEFAULT_TTL_MINUTES,
  DEFAULT_VIEW_MODE,
} from '../rss/constants'

export const DEFAULT_CONFIG: Config = {
  weather: {
    cities: [{ latitude: 39.9042, longitude: 116.4074, cityLabel: '北京', cmaStationId: '' }],
    ttlMinutes: 60,
  },
  v2ex: {
    ttlMinutes: 30,
    retentionDays: 7,
    todayMinReplies: 10,
    olderMinReplies: 20,
    ageHalfLifeDays: 2,
  },
  reddit: {
    ttlMinutes: 30,
    retentionDays: 7,
    todayMinComments: 10,
    olderMinComments: 20,
    ageHalfLifeDays: 2,
    subreddits: ['popular'],
  },
  hupu: {
    ttlMinutes: 30,
    boards: ['vote-hot'],
    retentionDays: 7,
    todayMinReplies: 10,
    olderMinReplies: 20,
    ageHalfLifeDays: 2,
    lightsWeight: 1,
    repliesWeight: 1,
  },
  novels: {
    books: [],
    ttlMinutes: 60,
    initialNewChapters: 3,
    maxNewChaptersPerBook: 5,
    maxLatestWindow: 200,
  },
  tnews: {
    ttlMinutes: 30,
  },
  rss: {
    feeds: [],
    ttlMinutes: DEFAULT_TTL_MINUTES,
    retentionDays: DEFAULT_RETENTION_DAYS,
    maxItemsPerFeed: DEFAULT_MAX_ITEMS_PER_FEED,
    viewMode: DEFAULT_VIEW_MODE,
  },
  xueqiu: {
    ttlMinutes: 30,
    retentionDays: 7,
  },
  misc: {
    ttlMinutes: 10,
  },
  xit: {
    enabled: true,
    placement: 'side',
  },
  shortcut: {
    doublePressWindowMs: 400,
    enabled: true,
  },
  hostAllowlist: ['v2ex.com', 'github.com', 'xueqiu.com'],
  sourceSettings: {},
} as const
