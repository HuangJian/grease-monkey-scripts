import type { Runtime } from '../../../runtime'
import type { TraeConfig, TraeData, TraePack, TraeQuotaEntry, TraeRawResponse } from './types'

const CONFIG_KEY = 'gm:misc:trae'
const DEFAULT_HOST = 'https://api-sg-central.trae.ai'

const PLAN_MAP: Record<number, string> = { 0: 'Free', 1: 'Pro', 2: 'Team', 3: 'Builder' }

const QUOTA_KEYS: Record<string, string> = {
  basic_usage_limit: 'Budget',
  bonus_usage_limit: 'Bonus',
}

export async function loadTraeConfig(runtime: Runtime): Promise<TraeConfig | null> {
  try {
    const raw = await runtime.getValue<unknown>(CONFIG_KEY, null)
    if (raw && typeof raw === 'object' && 'token' in raw) {
      return raw as TraeConfig
    }
  } catch {
    /* ignore */
  }
  return null
}

export function saveTraeConfig(runtime: Runtime, config: TraeConfig): void {
  void runtime.setValue(CONFIG_KEY, config)
}

export async function fetchTraeData(runtime: Runtime, config: TraeConfig): Promise<TraeData> {
  const host = config.host || DEFAULT_HOST
  const url = `${host}/trae/api/v1/pay/user_current_entitlement_list`

  const response = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    runtime.request({
      url,
      method: 'POST',
      timeout: 20000,
      headers: {
        Authorization: `Cloud-IDE-JWT ${config.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://www.trae.ai',
        Referer: 'https://www.trae.ai/',
      },
      data: JSON.stringify({ require_usage: true }),
      onload(resp) {
        resolve({ status: resp.status ?? 0, body: resp.responseText })
      },
      onerror: () => reject(new Error(`trae: network error`)),
      ontimeout: () => reject(new Error(`trae: timeout`)),
    })
  })

  if (response.status >= 400) {
    throw new Error(`trae: http ${response.status}`)
  }

  const raw: TraeRawResponse = JSON.parse(response.body)
  const rawPacks = raw.user_entitlement_pack_list ?? []
  const packs: TraePack[] = rawPacks.map((p) => {
    const info = p.entitlement_base_info ?? {}
    const quota = info.quota ?? {}
    const usage = p.usage ?? {}
    const productType = info.product_type ?? 0
    const quotas: TraeQuotaEntry[] = Object.entries(QUOTA_KEYS).map(([key, name]) => {
      const limit = (quota[key] as number) ?? 0
      const used = (usage[key.replace('_limit', '_amount')] as number) ?? 0
      return { name, limit, used, remaining: limit - used }
    })
    return {
      productType,
      planName: PLAN_MAP[productType] ?? `Unknown(${productType})`,
      status: p.status,
      endTime: info.end_time ?? null,
      quotas,
    }
  })

  return { packs }
}
