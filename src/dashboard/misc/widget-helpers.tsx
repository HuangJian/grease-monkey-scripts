import type { ComponentChildren } from 'preact'

export function pctClass(v: number): string {
  return v >= 50 ? 'gm-sp-misc-pct-high' : v >= 5 ? 'gm-sp-misc-pct-mid' : 'gm-sp-misc-pct-low'
}

export function fmtDate(ts: number): string {
  const d = new Date(ts * 1000)
  const month = d.toLocaleString('en', { month: 'short' })
  return `${month} ${d.getDate()}`
}

export type WidgetPhase = 'unconfigured' | 'just-configured' | 'loading' | 'ready' | 'error'

export function useWidgetPhase(
  config: unknown,
  data: unknown,
  error: string | null,
  justConfigured: boolean,
): WidgetPhase {
  if (!config && !justConfigured) return 'unconfigured'
  if (!config && justConfigured) return 'just-configured'
  if (!data && !error) return 'loading'
  if (error) return 'error'
  return 'ready'
}

export function WidgetShell(props: {
  name: string
  phase: WidgetPhase
  error?: string | null
  onConfigure?: () => void
  children?: ComponentChildren
}): preact.JSX.Element {
  const { name, phase, error, onConfigure, children } = props
  if (phase === 'unconfigured') {
    return (
      <div class="gm-sp-misc-standalone">
        {name}{' '}
        <span class="gm-sp-misc-config" onClick={() => onConfigure?.()}>
          点击配置
        </span>
      </div>
    )
  }
  if (phase === 'just-configured') {
    return <div class="gm-sp-misc-standalone">{name} 已配置，请刷新面板</div>
  }
  if (phase === 'loading') {
    return <div class="gm-sp-misc-standalone">加载中...</div>
  }
  return (
    <div class="gm-sp-misc">
      {error && (
        <div class="gm-sp-error-box gm-sp-misc-error-inline">
          <span>{error}</span>
          <span class="gm-sp-misc-config gm-sp-misc-reconfig" onClick={() => onConfigure?.()}>
            重新配置
          </span>
        </div>
      )}
      {children}
    </div>
  )
}
