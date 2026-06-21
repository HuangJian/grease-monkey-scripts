import { useState } from 'preact/hooks'
import type { TraeConfig, TraeData } from './types'

type Props = {
  config: TraeConfig | null
  data: TraeData | null
  error: string | null
  onConfigure?: () => void
}

function fmtDate(ts: number): string {
  const d = new Date(ts * 1000)
  const month = d.toLocaleString('en', { month: 'short' })
  return `${month} ${d.getDate()}`
}

function pctClass(v: number): string {
  return v >= 50 ? 'gm-sp-misc-pct-high' : v >= 5 ? 'gm-sp-misc-pct-mid' : 'gm-sp-misc-pct-low'
}

export function TraeWidget({ config, data, error, onConfigure }: Props) {
  const [justSet, setJustSet] = useState(false)

  if (!config && !justSet) {
    return (
      <div class="gm-sp-misc-standalone">
        Trae{' '}
        <span
          class="gm-sp-misc-config"
          onClick={() => {
            onConfigure?.()
            setJustSet(true)
          }}
        >
          点击配置
        </span>
      </div>
    )
  }
  if (!config && justSet) {
    return <div class="gm-sp-misc-standalone">Trae 已配置，请刷新面板</div>
  }
  if (!data && !error) {
    return <div class="gm-sp-misc-standalone">加载中...</div>
  }

  const active = data ? data.packs.filter((p) => p.status === 1) : []
  const target = active.length > 0 ? active[0] : data ? data.packs[0] : null

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
      {target && (
        <>
          <div class="gm-sp-misc-title-block">
            <a
              href="https://www.trae.ai/account-setting#usage"
              target="_blank"
              rel="noopener noreferrer"
            >
              Trae ({target.planName})
            </a>
          </div>
          {target.quotas.map((q) => {
            const remainingPct = q.limit > 0 ? Math.max(0, (q.remaining / q.limit) * 100) : 0
            return (
              <div key={q.name}>
                <span>{q.name}</span>
                <span class={`${pctClass(remainingPct)} gm-sp-misc-ml6`}>
                  {q.limit > 0 ? `${remainingPct.toFixed(0)}%` : '-'}
                </span>
                <span class="gm-sp-misc-soft gm-sp-misc-ml6">${q.limit.toFixed(2)} limit</span>
              </div>
            )
          })}
          {target.endTime && <div class="gm-sp-misc-reset">reset {fmtDate(target.endTime)}</div>}
        </>
      )}
      {!target && data && (
        <>
          <div class="gm-sp-misc-title-block">
            <a
              href="https://www.trae.ai/account-setting#usage"
              target="_blank"
              rel="noopener noreferrer"
            >
              Trae
            </a>
          </div>
          <span class="gm-sp-misc-muted gm-sp-misc-ml6">无可用套餐</span>
        </>
      )}
      {!target && !data && <span class="gm-sp-misc-muted">加载中...</span>}
    </div>
  )
}
