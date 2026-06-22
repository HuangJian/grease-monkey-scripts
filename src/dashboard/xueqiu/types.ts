export type XueqiuSourceOptions = {
  ttlMinutes: number
  retentionDays: number
}

export type XueqiuNewsItem = {
  id: number
  title: string
  text: string
  description: string
  target: string
  created_at: number
  status_id: number
  reply_count: number
  like_count?: number
  share_count: number
  view_count: number
  sub_type: number
}

export type XueqiuRenderData = {
  news: XueqiuNewsItem[]
  hotPosts: XueqiuNewsItem[]
}

export type XueqiuRankingOptions = {
  cqsWeight: number
  eqsWeight: number
  timeDecayWeight: number
  halfLifeDays: number
  minItems: number
}

export const DEFAULT_RANKING_OPTIONS: XueqiuRankingOptions = {
  cqsWeight: 0.35,
  eqsWeight: 0.45,
  timeDecayWeight: 0.2,
  halfLifeDays: 18,
  minItems: 5,
}
