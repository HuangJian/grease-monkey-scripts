import type { XueqiuNewsItem, XueqiuRankingOptions } from './types'

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Xueqiu 热议帖子质量排序算法
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  后续 agent 注意：修改算法时必须同步更新本注释，不要删除！
 *
 * 目标：从雪球热议的海量帖子中筛选出高质量、有深度的内容，过滤噪音。
 *
 * ── 阶段 1：噪音过滤 ────────────────────────────────────────────────────
 *   filterNoise(items) 对每个帖子执行：
 *   ① 纯文本长度 < 15 字符 且 互动量极低 → 移除
 *   ② 表情符号占比 > 50% → 移除（表情刷屏）
 *   短但高互动的帖子（如 "Space-x" 335赞74回复）保留——互动覆盖长度。
 *
 * ── 阶段 2：内容质量评分 (CQS, 0–1) ────────────────────────────────────
 *   computeContentQualityScore(item) 分析三个维度：
 *
 *   ① 长度分 lengthScore (权重 0.3)
 *     < 30 字符 → 0.1（极短，大概率低质量）
 *     30–100 → 0.3
 *     100–300 → 0.6
 *     300–800 → 0.8
 *     > 800 → 1.0（长文分析）
 *
 *   ② 数据丰富度 dataScore (权重 0.4)
 *     含股票代码 $XXX$ → +0.3
 *     含数字模式（百分比、金额）→ +0.2
 *     含分析关键词（估值/业绩/营收/利润/ROE/PE/Capex/产业链/逻辑/供需等）
 *       → 每个 +0.15，上限 0.5
 *
 *   ③ 结构分 structureScore (权重 0.3)
 *     含 <br> 换行（多段落结构化思考）→ +0.3
 *     含引用或数据引用 → +0.2
 *     纯文本无标签 → 0.2（可能是简短洞察）
 *
 * ── 阶段 3：互动质量评分 (EQS, 0–1) ───────────────────────────────────
 *   computeEngagementScore(item) 使用对数归一化（边际递减）：
 *     replyNorm = log(1 + reply_count) / log(201)   // 200回复 ≈ 1.0
 *     likeNorm  = log(1 + like_count) / log(501)     // 500赞 ≈ 1.0
 *     eqs = replyNorm × 0.5 + likeNorm × 0.5
 *
 *   讨论质量加成：若 reply_count > like_count × 0.3，说明引发深度讨论，
 *   施加 1.1× 加成。
 *
 * ── 阶段 4：时间衰减 ────────────────────────────────────────────────────
 *   computeTimeDecay(createdAt, now, halfLifeDays)：
 *     days = (now - created_at) / 86400000
 *     timeDecay = exp(-days × ln(2) / halfLifeDays)
 *
 *   默认半衰期 18 小时：
 *     0h → 1.0 | 6h → 0.79 | 12h → 0.63 | 18h → 0.50 | 24h → 0.40
 *
 * ── 阶段 5：综合评分 ────────────────────────────────────────────────────
 *   computeXueqiuScore(item, now, options)：
 *     score = cqs × cqsWeight + eqs × eqsWeight + timeDecay × timeDecayWeight
 *
 *   默认权重：cqs=0.35, eqs=0.45, timeDecay=0.20
 *   互动权重最高（社区共识），内容质量保证实质，时间衰减提供新鲜度。
 *
 * ── 阶段 6：动态展示数量 ────────────────────────────────────────────────
 *   rankHotPosts(items, now, options)：
 *     ① 过滤噪音
 *     ② 计算综合评分
 *     ③ 按分数降序排列
 *     ④ 使用 dynamicCount() 找到分数分布的"肘部"，决定展示数量
 *     ⑤ 返回排序后的 items（截取到动态数量）
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

// ── 常量 ──────────────────────────────────────────────────────────────────

const MIN_TEXT_LENGTH_FOR_NOISE_CHECK = 15

const LENGTH_RANGES: readonly {
  readonly min: number
  readonly max: number
  readonly score: number
}[] = [
  { min: 0, max: 30, score: 0.1 },
  { min: 30, max: 100, score: 0.3 },
  { min: 100, max: 300, score: 0.6 },
  { min: 300, max: 800, score: 0.8 },
  { min: 800, max: Infinity, score: 1.0 },
]

const ANALYSIS_KEYWORDS = [
  '估值',
  '业绩',
  '营收',
  '利润',
  '净利润',
  '毛利率',
  'ROE',
  'PE',
  'PB',
  'EV',
  'FCF',
  'Capex',
  '产业链',
  '供需',
  '产能',
  '出货量',
  '市占率',
  '逻辑',
  '基本面',
  '护城河',
  '估值锚',
  '戴维斯',
  '周期',
  '景气度',
  '渗透率',
  '龙头',
  '寡头',
]

const STOCK_CODE_PATTERN = /\$[A-Z0-9]{6,}\$/
const NUMBER_PATTERN = /\d+\.?\d*[%亿万]|\d+\.?\d*%/
const QUOTE_PATTERN = /[「」『』""《》]|^>|^—/
const BR_PATTERN = /<br\s*\/?>/i
const EMOJI_PATTERN =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu

// ── 工具函数 ──────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function countEmoji(text: string): number {
  const matches = text.match(EMOJI_PATTERN)
  return matches ? matches.length : 0
}

// ── 阶段 1：噪音过滤 ─────────────────────────────────────────────────────

export function isNoise(item: XueqiuNewsItem): boolean {
  const plainText = stripHtml(item.text)
  const len = plainText.length

  // 极短 + 低互动 = 噪音
  if (len < MIN_TEXT_LENGTH_FOR_NOISE_CHECK) {
    const lowReply = item.reply_count < 5
    const lowLike = (item.like_count ?? 0) < 20
    if (lowReply && lowLike) return true
  }

  // 表情刷屏
  const emojiCount = countEmoji(plainText)
  if (len > 0 && emojiCount / len > 0.5) return true

  return false
}

export function filterNoise(items: ReadonlyArray<XueqiuNewsItem>): XueqiuNewsItem[] {
  return items.filter((it) => !isNoise(it))
}

// ── 阶段 2：内容质量评分 ──────────────────────────────────────────────────

function computeLengthScore(plainText: string): number {
  const len = plainText.length
  for (const range of LENGTH_RANGES) {
    if (len >= range.min && len < range.max) return range.score
  }
  return 0.1
}

function computeDataScore(plainText: string, html: string): number {
  let score = 0

  if (STOCK_CODE_PATTERN.test(html)) score += 0.3
  if (NUMBER_PATTERN.test(plainText)) score += 0.2

  let keywordHits = 0
  for (const kw of ANALYSIS_KEYWORDS) {
    if (plainText.includes(kw)) {
      keywordHits++
      if (keywordHits >= 4) break
    }
  }
  score += Math.min(keywordHits * 0.15, 0.5)

  return Math.min(score, 1)
}

function computeStructureScore(html: string): number {
  let score = 0

  if (BR_PATTERN.test(html)) score += 0.3
  if (QUOTE_PATTERN.test(html)) score += 0.2

  // 纯文本无标签 → 基础分
  if (!/<[a-z]/i.test(html)) score = Math.max(score, 0.2)

  return Math.min(score, 1)
}

export function computeContentQualityScore(item: XueqiuNewsItem): number {
  const plainText = stripHtml(item.text)
  const lengthScore = computeLengthScore(plainText)
  const dataScore = computeDataScore(plainText, item.text)
  const structureScore = computeStructureScore(item.text)
  return lengthScore * 0.3 + dataScore * 0.4 + structureScore * 0.3
}

// ── 阶段 3：互动质量评分 ──────────────────────────────────────────────────

export function computeEngagementScore(item: XueqiuNewsItem): number {
  const replies = item.reply_count ?? 0
  const likes = item.like_count ?? 0

  const LOG_201 = Math.log(201)
  const LOG_501 = Math.log(501)

  const replyNorm = Math.log(1 + replies) / LOG_201
  const likeNorm = Math.log(1 + likes) / LOG_501

  let eqs = replyNorm * 0.5 + likeNorm * 0.5

  // 讨论质量加成：回复多于点赞的 30%，说明引发深度讨论
  if (replies > likes * 0.3) {
    eqs *= 1.1
  }

  return Math.min(eqs, 1)
}

// ── 阶段 4：时间衰减 ──────────────────────────────────────────────────────

export function computeTimeDecay(createdAt: number, now: number, halfLifeDays: number): number {
  const days = Math.max(0, (now - createdAt) / 86_400_000)
  const lambda = Math.log(2) / halfLifeDays
  return Math.exp(-days * lambda)
}

// ── 阶段 5：综合评分 ──────────────────────────────────────────────────────

export function computeXueqiuScore(
  item: XueqiuNewsItem,
  now: number,
  options: XueqiuRankingOptions,
): number {
  const cqs = computeContentQualityScore(item)
  const eqs = computeEngagementScore(item)
  const td = computeTimeDecay(item.created_at, now, options.halfLifeDays)
  return cqs * options.cqsWeight + eqs * options.eqsWeight + td * options.timeDecayWeight
}

// ── 阶段 6：完整排序管线 ──────────────────────────────────────────────────

export type ScoredItem = {
  item: XueqiuNewsItem
  score: number
}

export function rankHotPosts(
  items: ReadonlyArray<XueqiuNewsItem>,
  now: number,
  options: XueqiuRankingOptions,
): XueqiuNewsItem[] {
  const filtered = filterNoise(items)

  const scored: ScoredItem[] = filtered.map((item) => ({
    item,
    score: computeXueqiuScore(item, now, options),
  }))

  scored.sort((a, b) => b.score - a.score)

  const count = dynamicCount(
    scored.map((s) => s.score),
    options.minItems,
  )

  return scored.slice(0, count).map((s) => s.item)
}

/**
 * 动态展示数量：找到分数分布的"肘部"。
 *
 * 策略：相邻两项分数差占首位分数的比例 > elbowDropRatio 时截断。
 * 保证至少显示 minItems 项。
 */
function dynamicCount(scores: ReadonlyArray<number>, minItems: number): number {
  if (scores.length === 0) return 0
  const leader = scores[0]!
  if (!Number.isFinite(leader) || leader <= 0) return minItems

  const ELBOW_DROP_RATIO = 0.3

  for (let i = 1; i < scores.length; i++) {
    const prev = scores[i - 1]!
    const curr = scores[i]!
    const drop = (prev - curr) / leader
    if (drop > ELBOW_DROP_RATIO) return Math.max(minItems, i)
  }

  return scores.length
}
