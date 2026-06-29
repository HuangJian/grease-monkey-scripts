import { describe, expect, test } from 'bun:test'
import { createRuntime } from '../../../runtime'
import {
  fetchCodexUsage,
  loadCodexConfig,
  saveCodexConfig,
} from '../../../../src/prism/misc/codex/fetcher'
import type { CodexUsageResponse } from '../../../../src/prism/misc/codex/types'

const SAMPLE_RESPONSE: CodexUsageResponse = {
  user_id: 'user-test123',
  account_id: 'user-test123',
  email: 'test@example.com',
  plan_type: 'free',
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 5,
      limit_window_seconds: 2592000,
      reset_after_seconds: 2592000,
      reset_at: 1784560089,
    },
    secondary_window: null,
  },
  code_review_rate_limit: null,
  additional_rate_limits: null,
  credits: {
    has_credits: false,
    unlimited: false,
    overage_limit_reached: false,
    balance: null,
    approx_local_messages: null,
    approx_cloud_messages: null,
  },
  spend_control: { reached: false, individual_limit: null },
  rate_limit_reached_type: null,
  promo: null,
  referral_beacon: null,
  rate_limit_reset_credits: { available_count: 0 },
}

describe('fetchCodexUsage', () => {
  test('returns parsed response on success', async () => {
    const runtime = createRuntime()
    runtime.queueResponse(
      'https://chatgpt.com/backend-api/wham/usage',
      JSON.stringify(SAMPLE_RESPONSE),
      200,
    )

    const result = await fetchCodexUsage(runtime, { token: 'test-token' })
    expect(result.plan_type).toBe('free')
    expect(result.rate_limit.primary_window?.used_percent).toBe(5)
    expect(result.rate_limit.allowed).toBe(true)
    expect(runtime.lastRequest?.headers?.authorization).toBe('Bearer test-token')
  })

  test('rejects on HTTP error', async () => {
    const runtime = createRuntime()
    runtime.queueResponse('https://chatgpt.com/backend-api/wham/usage', 'Unauthorized', 401)

    await expect(fetchCodexUsage(runtime, { token: 'bad' })).rejects.toThrow(/http 401/)
  })

  test('rejects on network error', async () => {
    const runtime = createRuntime()
    await expect(fetchCodexUsage(runtime, { token: 't' })).rejects.toThrow(/network error/)
  })

  test('rejects on invalid JSON', async () => {
    const runtime = createRuntime()
    runtime.queueResponse('https://chatgpt.com/backend-api/wham/usage', 'not json', 200)

    await expect(fetchCodexUsage(runtime, { token: 't' })).rejects.toThrow(/invalid JSON/)
  })
})

describe('loadCodexConfig / saveCodexConfig', () => {
  test('saves and loads config', async () => {
    const runtime = createRuntime()
    const config = { token: 'my-token' }
    saveCodexConfig(runtime, config)
    const loaded = await loadCodexConfig(runtime)
    expect(loaded).toEqual(config)
  })

  test('returns null when no config stored', async () => {
    const runtime = createRuntime()
    const loaded = await loadCodexConfig(runtime)
    expect(loaded).toBeNull()
  })
})
