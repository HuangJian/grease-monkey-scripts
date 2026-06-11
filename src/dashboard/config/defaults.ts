import type { Config } from '../types'

export const DEFAULT_CONFIG: Config = {
  weather: {
    cities: [{ latitude: 39.9042, longitude: 116.4074, cityLabel: '北京' }],
    ttlMinutes: 60,
  },
  v2ex: {
    ttlMinutes: 30,
    minItems: 10,
    maxItems: Number.POSITIVE_INFINITY,
    displayRatio: 0.1,
    elbowDropRatio: 0.4,
    minReplies: 5,
    ageHalfLifeDays: 2,
  },
  reddit: {
    ttlMinutes: 30,
    ageHalfLifeDays: 2,
    subreddits: ['popular'],
    minItems: 10,
    maxItems: Number.POSITIVE_INFINITY,
    minPerSub: 1,
    displayRatio: 0.1,
    elbowDropRatio: 0.4,
    minCutoffScore: 500,
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
  xit: {
    enabled: true,
    placement: 'side',
  },
  shortcut: {
    doublePressWindowMs: 400,
    enabled: true,
  },
  hostAllowlist: ['mail.google.com', 'v2ex.com', 'github.com', 'www.sudugu.org'],
} as const
