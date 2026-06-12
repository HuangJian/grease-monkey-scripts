export type RedditPost = {
  id: string
  title: string
  url: string
  score: number
  numComments: number
  subreddits: string[]
  author: string
  created: number
}

export type StoredHistoryPost = {
  id: string
  title: string
  url: string
  score: number
  numComments: number
  subreddits: string[]
  author: string
  created: number
}

export type RedditCountOptions = {
  historyDays: number
  todayMinComments: number
  olderMinComments: number
  ageHalfLifeDays: number
}

export type RedditSourceOptions = {
  ttlMinutes: number
  subreddits: string[]
} & RedditCountOptions

export type RedditFetchResult = {
  posts: ReadonlyArray<{ sub: string; posts: RedditPost[] }>
  partialErrors: string[]
}
