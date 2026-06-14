/**
 * Xueqiu scoring constants.
 *
 * Patterns, keywords, and length ranges used for content quality scoring.
 */

export const MIN_TEXT_LENGTH_FOR_NOISE_CHECK = 15

export const LENGTH_RANGES: readonly {
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

export const ANALYSIS_KEYWORDS = [
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

export const STOCK_CODE_PATTERN = /\$[A-Z0-9]{6,}\$/
export const NUMBER_PATTERN = /\d+\.?\d*[%亿万]|\d+\.?\d*%/
export const QUOTE_PATTERN = /[「」『』""《》]|^>|^—/
export const BR_PATTERN = /<br\s*\/?>/i
export const EMOJI_PATTERN =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu
