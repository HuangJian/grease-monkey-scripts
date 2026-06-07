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
  minItems: number
  maxItems: number
  minPerSub: number
  displayRatio: number
  elbowDropRatio: number
  minCutoffScore: number
}

export type RedditSourceOptions = {
  ttlMinutes: number
  ageHalfLifeDays: number
  subreddits: string[]
} & RedditCountOptions

export type RedditFetchResult = {
  posts: ReadonlyArray<{ sub: string; posts: RedditPost[] }>
  partialErrors: string[]
}
