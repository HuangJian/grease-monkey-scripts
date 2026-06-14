/**
 * Reddit editor types and constants.
 */

export const FORM_FIELDS: {
  prop: string
  label: string
  min: number
  max?: number
  errorMsg: string
}[] = [
  { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
  { prop: 'historyDays', label: '历史保留天数', min: 1, errorMsg: '历史保留天数必须是 ≥1 的整数' },
  {
    prop: 'todayMinComments',
    label: '今日最低评论',
    min: 0,
    errorMsg: '今日最低评论必须 ≥0',
  },
  {
    prop: 'olderMinComments',
    label: '历史最低评论',
    min: 0,
    errorMsg: '历史最低评论必须 ≥0',
  },
  {
    prop: 'ageHalfLifeDays',
    label: '衰减半衰期（天）',
    min: 0.1,
    max: 30,
    errorMsg: '衰减半衰期必须是 0.1~30 之间',
  },
]
