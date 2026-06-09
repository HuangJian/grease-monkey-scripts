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
  minItems: number
  displayRatio: number
  elbowDropRatio: number
  minReplies: number
  ageHalfLifeDays: number
}

export type V2exSourceOptions = {
  ttlMinutes: number
} & V2exCountOptions
