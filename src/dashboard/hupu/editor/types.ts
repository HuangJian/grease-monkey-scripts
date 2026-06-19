/**
 * Hupu editor types and constants.
 */

export const FORM_FIELDS: {
  prop: string
  label: string
  min: number
  max?: number
  errorMsg: string
}[] = [
  { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
  {
    prop: 'todayMinReplies',
    label: '今日最低回复',
    min: 0,
    errorMsg: '今日最低回复必须 ≥0',
  },
  {
    prop: 'olderMinReplies',
    label: '历史最低回复',
    min: 0,
    errorMsg: '历史最低回复必须 ≥0',
  },
  {
    prop: 'ageHalfLifeDays',
    label: '衰减半衰期（天）',
    min: 0.1,
    max: 30,
    errorMsg: '衰减半衰期必须是 0.1~30 之间',
  },
  {
    prop: 'lightsWeight',
    label: '亮了权重',
    min: 0,
    max: 100,
    errorMsg: '亮了权重必须是 0~100 之间',
  },
  {
    prop: 'repliesWeight',
    label: '回复权重',
    min: 0,
    max: 100,
    errorMsg: '回复权重必须是 0~100 之间',
  },
]
