export type TraeConfig = {
  token: string
  host?: string
}

export type TraeQuotaEntry = {
  name: string
  limit: number
  used: number
  remaining: number
}

export type TraePack = {
  productType: number
  planName: string
  status: number
  endTime: number | null
  quotas: TraeQuotaEntry[]
}

export type TraeData = {
  packs: TraePack[]
}

export type TraeRawResponse = {
  user_entitlement_pack_list?: TraeRawPack[]
}

type TraeRawPack = {
  status: number
  entitlement_base_info?: {
    product_type?: number
    end_time?: number
    quota?: Record<string, number>
  }
  usage?: Record<string, number>
}
