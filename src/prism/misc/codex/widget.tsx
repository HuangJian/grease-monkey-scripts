import { useState } from 'preact/hooks'
import type { CodexConfig, CodexUsageResponse } from './types'
import { fmtDate, pctClass } from '../widget-helpers'

type Props = {
  config: CodexConfig | null
  data: CodexUsageResponse | null
  error: string | null
  onConfigure?: () => void
}

export function CodexWidget({ config, data, error, onConfigure }: Props) {
  const [justSet, setJustSet] = useState(false)

  if (!config && !justSet) {
    return (
      <div class="gm-sp-misc-standalone">
        Codex{' '}
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
    return <div class="gm-sp-misc-standalone">Codex 已配置，请刷新面板</div>
  }
  if (!data && !error) {
    return <div class="gm-sp-misc-standalone">加载中...</div>
  }

  const pri = data?.rate_limit.primary_window
  const usedPct = pri?.used_percent ?? 0
  const remainingPct = Math.max(0, 100 - usedPct)
  const resetDate = pri?.reset_at ? fmtDate(pri.reset_at) : '?'

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
      {data && (
        <>
          <div class="gm-sp-misc-title-block">
            <a
              href="https://chatgpt.com/codex/cloud/settings/analytics"
              target="_blank"
              rel="noopener noreferrer"
            >
              Codex ({data.plan_type})
            </a>
          </div>
          <span class={pctClass(remainingPct)}>{remainingPct.toFixed(0)}%</span>
          <span class="gm-sp-misc-soft"> remaining · reset {resetDate}</span>
        </>
      )}
      {!data && <span class="gm-sp-misc-muted">加载中...</span>}
    </div>
  )
}
