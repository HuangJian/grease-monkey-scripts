export type XueqiuSourceOptions = {
  ttlMinutes: number
  retentionDays: number
}

export type XueqiuAiConfig = {
  apiKey: string
  model: string
  apiUrl: string
  systemPrompt: string
}

export type SummaryTopic = {
  category: string
  title: string
  summary: string
  importance: 'high' | 'medium' | 'low'
  items: number[]
}

export type SummaryEntry = {
  id: string
  generatedAt: number
  topics: SummaryTopic[]
  newsCount: number
  itemCount: number
  elapsedMs: number
}

export type ViewMode = 'list' | 'summary'

export const DEFAULT_AI_MODEL = 'openrouter/owl-alpha'
export const DEFAULT_AI_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const DEFAULT_AI_SYSTEM_PROMPT = `你是一个专业的财经新闻编辑助手。你的任务是对一组雪球 7x24 快讯进行整合、归类、去重和摘要。

规则：
1. 将相关新闻按主题归类（如"地缘政治"、"宏观经济"、"A股"、"商品"、"科技"等），主题数量控制在 15-20 个
2. 同一事件的多次跟进报道合并为一个主题条目（如不同日期的病例数更新、价格变动等）
3. 每个主题生成 ≤100 字的摘要，突出关键信息和趋势，整合多条报道的核心内容
4. 仅省略以下低价值内容：纯个股涨跌、重复的经济数据公布、无实质内容的一行快讯；其余有信息量的新闻尽量归入相应主题
5. 按重要性排序：影响市场走势的 > 政策变动 > 行业动态 > 个股消息
6. 每个主题标注 importance: high/medium/low
7. 禁止将同一条新闻归入多个主题。如果一条新闻涉及多个领域，选择最主要的那个主题归入
8. 条数 <5 的主题合并到上级分类，不要单独成主题
9. 每个主题用 "items" 字段列出包含的新闻序号（输入中的 "i" 值），用逗号分隔的字符串

输出紧凑 JSON（不要换行缩进）：
{"topics":[{"c":"分类","t":"标题","s":"摘要","i":"high","items":"0,3,5,7"},{"c":"分类","t":"标题","s":"摘要","i":"low","items":"2,8,12"}]}`

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
