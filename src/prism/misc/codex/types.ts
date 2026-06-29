export type CodexConfig = {
  token: string
}

export type CodexUsageWindow = {
  used_percent: number
  limit_window_seconds: number
  reset_after_seconds: number
  reset_at: number
}

export type CodexRateLimit = {
  allowed: boolean
  limit_reached: boolean
  primary_window: CodexUsageWindow | null
  secondary_window: CodexUsageWindow | null
}

export type CodexCredits = {
  has_credits: boolean
  unlimited: boolean
  overage_limit_reached: boolean
  balance: number | null
  approx_local_messages: number | null
  approx_cloud_messages: number | null
}

export type CodexUsageResponse = {
  user_id: string
  account_id: string
  email: string
  plan_type: string
  rate_limit: CodexRateLimit
  credits: CodexCredits
  code_review_rate_limit: unknown
  additional_rate_limits: unknown
  spend_control: unknown
  rate_limit_reached_type: unknown
  promo: unknown
  referral_beacon: unknown
  rate_limit_reset_credits: unknown
}
