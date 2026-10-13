export type RedditPost = {
  id: string
  title: string
  url: string
  score: number
  numComments: number
  author: string
  created: number
}

export type RedditCountOptions = {
  todayMinComments: number
  olderMinComments: number
  ageHalfLifeDays: number
}

export type RedditSourceOptions = {
  ttlMinutes: number
  retentionDays: number
  /**
   * One entry per section. An entry is either a subreddit (`opencode`) or
   * several merged into one section with `+` (`opencode+opencodecli`).
   */
  subreddits: string[]
} & RedditCountOptions

export type RedditFetchResult = {
  posts: ReadonlyArray<{ sub: string; posts: RedditPost[] }>
  partialErrors: string[]
}
