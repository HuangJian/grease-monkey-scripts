import { afterEach, describe, expect, test } from 'bun:test'
import { render, cleanup } from '@testing-library/preact'
import { DATE_OPTIONS, dateFilterBounds, DateFilterGroup } from '../../src/dashboard/date-filter'

describe('DATE_OPTIONS', () => {
  test('has exactly 6 entries', () => {
    expect(DATE_OPTIONS).toHaveLength(6)
  })

  test('contains expected filters', () => {
    expect(DATE_OPTIONS).toEqual(['全', '今', '昨', '前', '早', '未'])
  })
})

describe('dateFilterBounds', () => {
  function todayStart(now: number): number {
    const d = new Date(now)
    d.setUTCHours(0, 0, 0, 0)
    return d.getTime()
  }

  test('全 returns null', () => {
    expect(dateFilterBounds('全', Date.now())).toBeNull()
  })

  test('今 returns start at today 00:00 UTC', () => {
    const now = Date.now()
    const result = dateFilterBounds('今', now)
    expect(result).toEqual({ start: todayStart(now) })
  })

  test('昨 returns start at yesterday, end at today', () => {
    const now = Date.now()
    const ts = todayStart(now)
    const result = dateFilterBounds('昨', now)
    expect(result).toEqual({ start: ts - 86400000, end: ts })
  })

  test('前 returns start at day-before-yesterday, end at yesterday', () => {
    const now = Date.now()
    const ts = todayStart(now)
    const result = dateFilterBounds('前', now)
    expect(result).toEqual({ start: ts - 172800000, end: ts - 86400000 })
  })

  test('早 returns end at day-before-yesterday', () => {
    const now = Date.now()
    const ts = todayStart(now)
    const result = dateFilterBounds('早', now)
    expect(result).toEqual({ end: ts - 172800000 })
  })
})

describe('DateFilterGroup', () => {
  afterEach(cleanup)

  test('renders 6 buttons', () => {
    render(<DateFilterGroup value="全" onChange={() => {}} />)
    const buttons = document.querySelectorAll('.gm-sp-date-filter-btn')
    expect(buttons).toHaveLength(6)
  })

  test('applies active class to selected button', () => {
    render(<DateFilterGroup value="今" onChange={() => {}} />)
    const buttons = document.querySelectorAll('.gm-sp-date-filter-btn')
    const activeButtons = document.querySelectorAll('.gm-sp-date-filter-btn-active')
    expect(activeButtons).toHaveLength(1)
    expect(buttons[1]?.classList.contains('gm-sp-date-filter-btn-active')).toBe(true)
  })

  test('calls onChange when button clicked', () => {
    let changed = ''
    render(
      <DateFilterGroup
        value="全"
        onChange={(f) => {
          changed = f
        }}
      />,
    )
    const buttons = document.querySelectorAll('.gm-sp-date-filter-btn')
    ;(buttons[2] as HTMLButtonElement).click()
    expect(changed).toBe('昨')
  })

  test('renders trailing content when provided', () => {
    render(
      <DateFilterGroup
        value="全"
        onChange={() => {}}
        trailing={<span class="trailing">test</span>}
      />,
    )
    const trailing = document.querySelector('.trailing')
    expect(trailing).not.toBeNull()
    expect(trailing?.textContent).toBe('test')
  })

  test('does not render trailing when not provided', () => {
    render(<DateFilterGroup value="全" onChange={() => {}} />)
    const trailing = document.querySelector('.trailing')
    expect(trailing).toBeNull()
  })
})
