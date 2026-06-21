import type { CodexConfig, CodexUsageResponse } from './codex/types'
import type { AntigravityConfig, AntigravityData } from './antigravity/types'
import type { OpenRouterData } from './openrouter/types'
import type { TraeConfig, TraeData } from './trae/types'

export type MiscBadgeType = 'none' | 'pct50' | 'pct30'

export type MiscOptions = {
  ttlMinutes: number
  badgeType: MiscBadgeType
}

export type MiscData = {
  codex: {
    config: CodexConfig | null
    data: CodexUsageResponse | null
    error: string | null
  }
  antigravity: {
    config: AntigravityConfig | null
    data: AntigravityData | null
    error: string | null
  }
  openrouter: {
    config: null
    data: OpenRouterData | null
    error: string | null
  }
  trae: {
    config: TraeConfig | null
    data: TraeData | null
    error: string | null
  }
}
