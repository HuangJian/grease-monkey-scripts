/**
 * Codex data fetcher.
 *
 * Fetches usage data from ChatGPT (Codex) WHAM API.
 *
 * Test script: scripts/fetchers/codex-test.user.js
 *   Install as Tampermonkey userscript to verify fetching.
 */
import type { Runtime } from '../../../runtime'
import type { CodexConfig, CodexUsageResponse } from './types'

const CONFIG_KEY = 'gm:misc:codex'
const WHAM_URL = 'https://chatgpt.com/backend-api/wham/usage'

export async function loadCodexConfig(runtime: Runtime): Promise<CodexConfig | null> {
  try {
    const raw = await runtime.getValue<unknown>(CONFIG_KEY, null)
    if (raw && typeof raw === 'object' && 'token' in raw) {
      return raw as CodexConfig
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveCodexConfig(runtime: Runtime, config: CodexConfig): void {
  void runtime.setValue(CONFIG_KEY, config)
}

export function fetchCodexUsage(
  runtime: Runtime,
  config: CodexConfig,
): Promise<CodexUsageResponse> {
  return new Promise<CodexUsageResponse>((resolve, reject) => {
    runtime.request({
      url: WHAM_URL,
      method: 'GET',
      timeout: 15000,
      headers: {
        accept: '*/*',
        authorization: `Bearer ${config.token}`,
      },
      onload(response) {
        if (response.status >= 400) {
          reject(new Error(`codex: http ${response.status}`))
          return
        }
        try {
          const data = JSON.parse(response.responseText) as CodexUsageResponse
          resolve(data)
        } catch {
          reject(new Error('codex: invalid JSON response'))
        }
      },
      onerror: () => reject(new Error('codex: network error')),
      ontimeout: () => reject(new Error('codex: timeout')),
    })
  })
}
