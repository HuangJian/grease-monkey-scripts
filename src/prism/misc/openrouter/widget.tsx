import type { OpenRouterData } from './types'

type Props = {
  data: OpenRouterData | null
  error: string | null
}

function fmtTokens(n: number | null): string {
  if (n === null) return 'N/A'
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

export function OpenRouterWidget({ data, error }: Props) {
  if (!data && !error) {
    return <div class="gm-sp-misc-standalone">加载中...</div>
  }

  return (
    <div class="gm-sp-misc">
      {error && <div class="gm-sp-error-box gm-sp-misc-error-inline">{error}</div>}
      {data && (
        <>
          <div class="gm-sp-misc-title-block">
            <a
              href="https://openrouter.ai/rankings#categories"
              target="_blank"
              rel="noopener noreferrer"
            >
              OpenRouter Free ({data.models.length})
            </a>
          </div>
          <div class="gm-sp-misc-or-table">
            <span class="gm-sp-misc-or-header gm-sp-misc-nums">#</span>
            <span class="gm-sp-misc-or-header">Model</span>
            <span class="gm-sp-misc-or-header gm-sp-misc-nums">Tokens(3d)</span>
            <span class="gm-sp-misc-or-header">Params</span>
            <span class="gm-sp-misc-or-header">Context</span>
            <span class="gm-sp-misc-or-header">Provider</span>
            {data.models.map((m) => (
              <span key={m.id} class="gm-sp-misc-or-row">
                <span class="gm-sp-misc-rank">{m.rank != null ? m.rank : '?'}</span>
                <span class="gm-sp-misc-or-cell">
                  <a
                    href={`https://openrouter.ai/models/${m.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {m.name}
                  </a>
                </span>
                <span class="gm-sp-misc-soft gm-sp-misc-nums">{fmtTokens(m.totalTokens3Days)}</span>
                <span class="gm-sp-misc-soft">{m.parameterSize}</span>
                <span class="gm-sp-misc-soft gm-sp-misc-nums">
                  {m.contextLength > 0 ? `${(m.contextLength / 1024).toFixed(0)}k` : '?'}
                </span>
                <span class="gm-sp-misc-muted">{m.provider}</span>
              </span>
            ))}
          </div>
        </>
      )}
      {!data && <div class="gm-sp-misc-muted">加载中...</div>}
    </div>
  )
}
