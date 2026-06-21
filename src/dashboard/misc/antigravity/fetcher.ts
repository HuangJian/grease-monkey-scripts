import type { Runtime } from '../../../runtime'
import type {
  AntigravityConfig,
  AntigravityData,
  AntigravityModelDisplay,
  AntigravityLoadCodeAssistResponse,
  AntigravityFetchModelsResponse,
} from './types'

const CONFIG_KEY = 'gm:misc:antigravity'

const CLIENT_ID = ''
const CLIENT_SECRET = ''
const OAUTH_URL = 'https://oauth2.googleapis.com/token'
const CLOUDCODE_URL = 'https://cloudcode-pa.googleapis.com'

function gmFetch(
  runtime: Runtime,
  opts: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
    timeout?: number
  },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    runtime.request({
      url: opts.url,
      method: opts.method,
      headers: opts.headers,
      data: opts.body,
      timeout: opts.timeout ?? 20000,
      onload(resp) {
        resolve({ status: resp.status ?? 0, body: resp.responseText })
      },
      onerror: () => reject(new Error(`antigravity: network error ${opts.url}`)),
      ontimeout: () => reject(new Error(`antigravity: timeout ${opts.url}`)),
    })
  })
}

async function refreshAccessToken(runtime: Runtime, refreshToken: string): Promise<string> {
  const body =
    'client_id=' +
    encodeURIComponent(CLIENT_ID) +
    '&client_secret=' +
    encodeURIComponent(CLIENT_SECRET) +
    '&refresh_token=' +
    encodeURIComponent(refreshToken) +
    '&grant_type=refresh_token'

  const resp = await gmFetch(runtime, {
    url: OAUTH_URL,
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (resp.status >= 400) {
    throw new Error(`antigravity: token refresh failed (${resp.status})`)
  }

  const data = JSON.parse(resp.body)
  return data.access_token as string
}

async function resolveProjectId(
  runtime: Runtime,
  accessToken: string,
): Promise<string | undefined> {
  const resp = await gmFetch(runtime, {
    url: CLOUDCODE_URL + '/v1internal:loadCodeAssist',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity',
    },
    body: JSON.stringify({
      metadata: { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' },
    }),
  })

  if (resp.status >= 400) return undefined

  const data = JSON.parse(resp.body) as AntigravityLoadCodeAssistResponse
  const project = data.cloudaicompanionProject
  if (typeof project === 'string' && project) return project
  if (project && typeof project === 'object' && 'id' in project)
    return (project as { id: string }).id
  return undefined
}

function formatDuration(ms: number): string {
  if (ms <= 0) return 'Ready'
  const min = Math.ceil(ms / 60000)
  if (min < 60) return min + 'm'
  const h = Math.floor(min / 60)
  if (h < 24) return h + 'h ' + (min % 60) + 'm'
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h'
}

// Models to skip (chat variants, tab variants, lite dupes)
function isLowValueModel(key: string, _displayName: string): boolean {
  const lower = key.toLowerCase()
  if (lower.startsWith('chat_') || lower.startsWith('tab_')) return true
  return false
}

export async function loadAntigravityConfig(runtime: Runtime): Promise<AntigravityConfig | null> {
  try {
    const raw = await runtime.getValue<unknown>(CONFIG_KEY, null)
    if (raw && typeof raw === 'object' && 'refreshToken' in raw) {
      return raw as AntigravityConfig
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveAntigravityConfig(runtime: Runtime, config: AntigravityConfig): void {
  void runtime.setValue(CONFIG_KEY, config)
}

export async function fetchAntigravityQuota(
  runtime: Runtime,
  config: AntigravityConfig,
): Promise<AntigravityData> {
  const accessToken = await refreshAccessToken(runtime, config.refreshToken)
  const projectId = await resolveProjectId(runtime, accessToken)

  const payload = projectId ? { project: projectId } : {}
  const resp = await gmFetch(runtime, {
    url: CLOUDCODE_URL + '/v1internal:fetchAvailableModels',
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity',
    },
    body: JSON.stringify(payload),
  })

  if (resp.status >= 400) {
    throw new Error(`antigravity: fetch models failed (${resp.status})`)
  }

  const data = JSON.parse(resp.body) as AntigravityFetchModelsResponse
  const now = Date.now()
  const models: AntigravityModelDisplay[] = []

  if (data.models) {
    for (const [key, info] of Object.entries(data.models)) {
      if (!info.quotaInfo) continue
      if (isLowValueModel(key, info.displayName || '')) continue

      const remainingFraction = info.quotaInfo.remainingFraction ?? 0
      const remainingPercent = Math.min(100, Math.max(0, remainingFraction * 100))
      let resetTime: Date | null = null
      let resetIn = ''

      if (info.quotaInfo.resetTime) {
        const parsed = new Date(info.quotaInfo.resetTime)
        if (!isNaN(parsed.getTime())) {
          resetTime = parsed
          const diff = parsed.getTime() - now
          resetIn = diff > 0 ? formatDuration(diff) : 'Ready'
        }
      }

      models.push({
        id: info.model || key,
        label: info.displayName || key,
        remainingFraction,
        remainingPercent,
        isExhausted: remainingFraction <= 0,
        resetTime,
        resetIn,
        recommended: !!info.recommended,
        tag: info.tagTitle || '',
      })
    }
  }

  models.sort((a, b) => a.label.localeCompare(b.label))

  return { models, fetchedAt: new Date() }
}
