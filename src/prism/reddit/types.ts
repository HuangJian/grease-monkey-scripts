export type RedditPost = {
  id: string
  title: string
  url: string
  score: number
  numComments: number
  author: string
  created: number
  /**
   * False when the channel carries no vote/comment counts — Reddit's Atom feed
   * does not supply them. Readers must then skip the vote-based gating and
   * ranking rather than treat the zero placeholders as measured data.
   */
  metrics?: boolean
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
