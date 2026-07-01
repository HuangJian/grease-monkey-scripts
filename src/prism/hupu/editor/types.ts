import type { NumberFieldDef } from '../../editor-helpers'

/**
 * Hupu editor types and constants.
 */

export const FORM_FIELDS: NumberFieldDef[] = [
  { prop: 'ttlMinutes', name: 'TTL', unit: '分钟', min: 1, integer: true },
  { prop: 'retentionDays', name: '数据保留', unit: '天', min: 1, max: 90, integer: true },
  { prop: 'todayMinReplies', name: '今日最低回复', min: 0 },
  { prop: 'olderMinReplies', name: '历史最低回复', min: 0 },
  { prop: 'ageHalfLifeDays', name: '衰减半衰期', unit: '天', min: 0.1, max: 30 },
  { prop: 'lightsWeight', name: '亮了权重', min: 0, max: 100 },
  { prop: 'repliesWeight', name: '回复权重', min: 0, max: 100 },
]
