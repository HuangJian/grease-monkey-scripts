import type { OpenRouterData } from './openrouter/types'

export type MiscOptions = {
  ttlMinutes: number
}

export type MiscData = {
  openrouter: {
    data: OpenRouterData | null
    error: string | null
  }
}
