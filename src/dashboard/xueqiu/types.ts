export type XueqiuSourceOptions = {
  ttlMinutes: number
  scrollWaitMs: number
  scrollMaxNoChange: number
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
  like_count: number
  share_count: number
  view_count: number
  sub_type: number
}

export type XueqiuRenderData = {
  news: XueqiuNewsItem[]
  hotPosts: XueqiuNewsItem[]
}
