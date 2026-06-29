import { afterEach, describe, expect, test } from 'bun:test'
import { render, cleanup } from '@testing-library/preact'
import { pctClass, fmtDate, useWidgetPhase, WidgetShell } from '../../src/prism/misc/widget-helpers'

describe('pctClass', () => {
  test('returns high for >= 50', () => {
    expect(pctClass(50)).toBe('gm-sp-misc-pct-high')
    expect(pctClass(100)).toBe('gm-sp-misc-pct-high')
  })

  test('returns mid for >= 5 and < 50', () => {
    expect(pctClass(5)).toBe('gm-sp-misc-pct-mid')
    expect(pctClass(25)).toBe('gm-sp-misc-pct-mid')
    expect(pctClass(49)).toBe('gm-sp-misc-pct-mid')
  })

  test('returns low for < 5', () => {
    expect(pctClass(0)).toBe('gm-sp-misc-pct-low')
    expect(pctClass(4)).toBe('gm-sp-misc-pct-low')
    expect(pctClass(-1)).toBe('gm-sp-misc-pct-low')
  })
})

describe('fmtDate', () => {
  test('formats Unix timestamp to month day', () => {
    // 2024-01-15 00:00:00 UTC
    const ts = 1705276800
    const result = fmtDate(ts)
    expect(result).toContain('15')
    expect(result).toContain('Jan')
  })

  test('formats different months', () => {
    // 2024-06-20 00:00:00 UTC
    const ts = 1718841600
    const result = fmtDate(ts)
    expect(result).toContain('20')
    expect(result).toContain('Jun')
  })
})

describe('useWidgetPhase', () => {
  test('returns unconfigured when no config and not just configured', () => {
    expect(useWidgetPhase(null, null, null, false)).toBe('unconfigured')
    expect(useWidgetPhase(undefined, null, null, false)).toBe('unconfigured')
  })

  test('returns just-configured when no config but justConfigured is true', () => {
    expect(useWidgetPhase(null, null, null, true)).toBe('just-configured')
    expect(useWidgetPhase(undefined, null, null, true)).toBe('just-configured')
  })

  test('returns loading when config exists but no data and no error', () => {
    expect(useWidgetPhase({ key: 'val' }, null, null, false)).toBe('loading')
    expect(useWidgetPhase({ key: 'val' }, undefined, null, false)).toBe('loading')
  })

  test('returns error when error is present', () => {
    expect(useWidgetPhase({ key: 'val' }, null, 'fail', false)).toBe('error')
    expect(useWidgetPhase({ key: 'val' }, 'data', 'fail', false)).toBe('error')
  })

  test('returns ready when data is present and no error', () => {
    expect(useWidgetPhase({ key: 'val' }, 'data', null, false)).toBe('ready')
    expect(useWidgetPhase({ key: 'val' }, [], null, false)).toBe('ready')
  })
})

describe('WidgetShell', () => {
  afterEach(cleanup)

  test('renders unconfigured state with configure link', () => {
    render(<WidgetShell name="Codex" phase="unconfigured" onConfigure={() => {}} />)
    const el = document.querySelector('.gm-sp-misc-standalone')
    expect(el).not.toBeNull()
    expect(el?.textContent).toContain('Codex')
    expect(el?.textContent).toContain('点击配置')
  })

  test('renders just-configured state', () => {
    render(<WidgetShell name="Codex" phase="just-configured" />)
    const el = document.querySelector('.gm-sp-misc-standalone')
    expect(el?.textContent).toContain('已配置')
  })

  test('renders loading state', () => {
    render(<WidgetShell name="Codex" phase="loading" />)
    const el = document.querySelector('.gm-sp-misc-standalone')
    expect(el?.textContent).toContain('加载中')
  })

  test('renders error state with error message and reconfig link', () => {
    render(<WidgetShell name="Codex" phase="error" error="fetch failed" onConfigure={() => {}} />)
    const errorBox = document.querySelector('.gm-sp-error-box')
    expect(errorBox).not.toBeNull()
    expect(errorBox?.textContent).toContain('fetch failed')
    expect(errorBox?.textContent).toContain('重新配置')
  })

  test('renders ready state with children', () => {
    render(
      <WidgetShell name="Codex" phase="ready">
        <span class="child-content">data here</span>
      </WidgetShell>,
    )
    const child = document.querySelector('.child-content')
    expect(child).not.toBeNull()
    expect(child?.textContent).toBe('data here')
  })

  test('calls onConfigure when configure link clicked', () => {
    let called = false
    render(
      <WidgetShell
        name="Codex"
        phase="unconfigured"
        onConfigure={() => {
          called = true
        }}
      />,
    )
    const link = document.querySelector('.gm-sp-misc-config') as HTMLElement
    link.click()
    expect(called).toBe(true)
  })
})
