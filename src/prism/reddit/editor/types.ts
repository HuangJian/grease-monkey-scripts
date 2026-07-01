import type { NumberFieldDef } from '../../editor-helpers'

/**
 * Reddit editor types and constants.
 */

export const FORM_FIELDS: NumberFieldDef[] = [
  { prop: 'ttlMinutes', name: 'TTL', unit: '分钟', min: 1, integer: true },
  { prop: 'retentionDays', name: '数据保留', unit: '天', min: 1, max: 90, integer: true },
  { prop: 'todayMinComments', name: '今日最低评论', min: 0 },
  { prop: 'olderMinComments', name: '历史最低评论', min: 0 },
  { prop: 'ageHalfLifeDays', name: '衰减半衰期', unit: '天', min: 0.1, max: 30 },
]
