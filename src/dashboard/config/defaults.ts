import type { Config } from '../types'

export const DEFAULT_CONFIG: Config = {
  weather: {
    cities: [{ latitude: 39.9042, longitude: 116.4074, cityLabel: '北京' }],
    ttlMinutes: 60,
  },
  v2ex: {
    ttlMinutes: 30,
    historyDays: 7,
    todayMinReplies: 10,
    olderMinReplies: 20,
    ageHalfLifeDays: 2,
  },
  reddit: {
    ttlMinutes: 30,
    historyDays: 7,
    todayMinComments: 10,
    olderMinComments: 20,
    ageHalfLifeDays: 2,
    subreddits: ['popular'],
  },
  hupu: {
    ttlMinutes: 30,
    boards: ['vote-hot'],
    historyDays: 7,
    todayMinReplies: 10,
    olderMinReplies: 20,
    ageHalfLifeDays: 2,
    lightsWeight: 1,
    repliesWeight: 1,
  },
  novels: {
    entries: [],
    ttlMinutes: 60,
    initialNewChapters: 3,
    maxNewChaptersPerBook: 5,
    maxLatestWindow: Number.POSITIVE_INFINITY,
  },
  tnews: {
    feeds: ['https://rsshub.app/telegram/channel/tnews365'],
    mirrors: ['rsshub.rssforever.com'],
    ttlMinutes: 30,
  },
  xueqiu: {
    ttlMinutes: 30,
    scrollWaitMs: 100,
    scrollMaxNoChange: 20,
  },
  xit: {
    enabled: true,
    placement: 'side',
  },
  shortcut: {
    doublePressWindowMs: 400,
    enabled: true,
  },
  hostAllowlist: ['mail.google.com', 'v2ex.com', 'github.com', 'www.sudugu.org', 'xueqiu.com'],
  sourceSettings: {},
} as const
