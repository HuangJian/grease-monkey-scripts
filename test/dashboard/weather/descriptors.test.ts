import { describe, expect, test } from 'bun:test'
import { precipLabel, windLabel } from '../../../src/dashboard/weather/descriptors'

describe('precipLabel', () => {
  test('returns null for null/undefined/zero', () => {
    expect(precipLabel(null, 'hour')).toBe(null)
    expect(precipLabel(undefined, 'hour')).toBe(null)
    expect(precipLabel(0, 'hour')).toBe(null)
    expect(precipLabel(0, 'day')).toBe(null)
  })

  test('hour thresholds', () => {
    expect(precipLabel(0.5, 'hour')).toBe('微')
    expect(precipLabel(1, 'hour')).toBe('小')
    expect(precipLabel(3.9, 'hour')).toBe('小')
    expect(precipLabel(4, 'hour')).toBe('中')
    expect(precipLabel(9.9, 'hour')).toBe('中')
    expect(precipLabel(10, 'hour')).toBe('大')
    expect(precipLabel(24.9, 'hour')).toBe('大')
    expect(precipLabel(25, 'hour')).toBe('暴')
    expect(precipLabel(50, 'hour')).toBe('暴')
  })

  test('day thresholds', () => {
    expect(precipLabel(0.5, 'day')).toBe('微')
    expect(precipLabel(1, 'day')).toBe('小')
    expect(precipLabel(9.9, 'day')).toBe('小')
    expect(precipLabel(10, 'day')).toBe('中')
    expect(precipLabel(24.9, 'day')).toBe('中')
    expect(precipLabel(25, 'day')).toBe('大')
    expect(precipLabel(49.9, 'day')).toBe('大')
    expect(precipLabel(50, 'day')).toBe('暴')
  })
})

describe('windLabel', () => {
  test('returns null for null/undefined', () => {
    expect(windLabel(null)).toBe(null)
    expect(windLabel(undefined)).toBe(null)
  })

  test('thresholds', () => {
    expect(windLabel(0)).toBe('静')
    expect(windLabel(5.9)).toBe('静')
    expect(windLabel(6)).toBe('微')
    expect(windLabel(11.9)).toBe('微')
    expect(windLabel(12)).toBe('和')
    expect(windLabel(19.9)).toBe('和')
    expect(windLabel(20)).toBe('清')
    expect(windLabel(28.9)).toBe('清')
    expect(windLabel(29)).toBe('强')
    expect(windLabel(38.9)).toBe('强')
    expect(windLabel(39)).toBe('劲')
    expect(windLabel(49.9)).toBe('劲')
    expect(windLabel(50)).toBe('大')
    expect(windLabel(80)).toBe('大')
  })
})
