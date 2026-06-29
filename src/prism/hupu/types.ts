export type HupuPost = {
  id: string
  title: string
  url: string
  lights: number
  replies: number
  views: number
  author: string
  authorUrl: string
  board: string
  topicName: string
  created: number
}

export type HupuCountOptions = {
  todayMinReplies: number
  olderMinReplies: number
  ageHalfLifeDays: number
  lightsWeight: number
  repliesWeight: number
}

export type HupuSourceOptions = {
  ttlMinutes: number
  retentionDays: number
  boards: string[]
} & HupuCountOptions

export type HupuFetchResult = {
  boards: ReadonlyArray<{ board: string; posts: HupuPost[] }>
  partialErrors: string[]
}
