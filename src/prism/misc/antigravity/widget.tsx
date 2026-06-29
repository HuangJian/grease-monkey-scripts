import { useState } from 'preact/hooks'
import type { AntigravityConfig, AntigravityData, AntigravityModelDisplay } from './types'
import { pctClass } from '../widget-helpers'

type Props = {
  config: AntigravityConfig | null
  data: AntigravityData | null
  error: string | null
  onConfigure?: () => void
}

export function pickBest(
  models: AntigravityModelDisplay[],
  pattern: RegExp,
): AntigravityModelDisplay | null {
  const matched = models.filter((m) => pattern.test(m.label) || pattern.test(m.id))
  if (matched.length === 0) return null
  matched.sort((a, b) => {
    const va = parseFloat(a.label.match(/[\d.]+/)?.[0] ?? '0')
    const vb = parseFloat(b.label.match(/[\d.]+/)?.[0] ?? '0')
    return vb - va
  })
  return matched[0]
}

export function AntigravityWidget({ config, data, error, onConfigure }: Props) {
  const [justSet, setJustSet] = useState(false)

  if (!config && !justSet) {
    return (
      <div class="gm-sp-misc-standalone">
        Antigravity{' '}
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
    return <div class="gm-sp-misc-standalone">Antigravity 已配置，请刷新面板</div>
  }
  if (!data && !error) {
    return <div class="gm-sp-misc-standalone">加载中...</div>
  }

  const claude = data ? pickBest(data.models, /claude.*opus/i) : null
  const flash = data ? pickBest(data.models, /gemini.*flash/i) : null

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
          <div class="gm-sp-misc-title-block">Antigravity</div>
          {claude && (
            <div>
              <span>{claude.label}</span>
              <span class={`${pctClass(claude.remainingPercent)} gm-sp-misc-ml6`}>
                {claude.remainingPercent.toFixed(0)}% {claude.resetIn ? `(${claude.resetIn})` : ''}
              </span>
            </div>
          )}
          {flash && (
            <div>
              <span>{flash.label}</span>
              <span class={`${pctClass(flash.remainingPercent)} gm-sp-misc-ml6`}>
                {flash.remainingPercent.toFixed(0)}% {flash.resetIn ? `(${flash.resetIn})` : ''}
              </span>
            </div>
          )}
          {!claude && !flash && <div class="gm-sp-misc-muted">无可用模型</div>}
        </>
      )}
      {!data && <div class="gm-sp-misc-muted">加载中...</div>}
    </div>
  )
}
