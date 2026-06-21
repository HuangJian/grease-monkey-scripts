export type AntigravityConfig = {
  refreshToken: string
}

export type AntigravityQuotaInfo = {
  remainingFraction?: number
  resetTime?: string
}

export type AntigravityModelInfo = {
  displayName: string
  model: string
  quotaInfo?: AntigravityQuotaInfo
  recommended?: boolean
  tagTitle?: string
  maxTokens?: number
  maxOutputTokens?: number
}

export type AntigravityLoadCodeAssistResponse = {
  cloudaicompanionProject?: string | { id: string }
  currentTier?: { id: string }
}

export type AntigravityFetchModelsResponse = {
  models?: Record<string, AntigravityModelInfo>
}

export type AntigravityModelDisplay = {
  id: string
  label: string
  remainingFraction: number
  remainingPercent: number
  isExhausted: boolean
  resetTime: Date | null
  resetIn: string
  recommended: boolean
  tag: string
}

export type AntigravityData = {
  models: AntigravityModelDisplay[]
  fetchedAt: Date
}
