export type RedditPost = {
  id: string
  title: string
  url: string
  score: number
  numComments: number
  subreddits: string[]
  author: string
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
  subreddits: string[]
} & RedditCountOptions

export type RedditFetchResult = {
  posts: RedditPost[]
  partialErrors: string[]
}
