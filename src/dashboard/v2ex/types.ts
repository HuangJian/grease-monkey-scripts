export type V2exSource = 'api' | 'page'

export type V2exTopic = {
  id: number
  title: string
  url: string
  replies: number
  member: { username: string }
  node: { title: string }
  sources?: ReadonlyArray<V2exSource>
  created?: number
}

export type V2exCountOptions = {
  todayMinReplies: number
  olderMinReplies: number
  ageHalfLifeDays: number
}

export type V2exSourceOptions = {
  ttlMinutes: number
  retentionDays: number
} & V2exCountOptions
