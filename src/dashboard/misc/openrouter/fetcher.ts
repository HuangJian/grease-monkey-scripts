import type { Runtime } from '../../../runtime'
import type { OpenRouterData, OpenRouterFreeModel } from './types'

const MODELS_URL = 'https://openrouter.ai/api/v1/models?category=programming'
const RANKINGS_URL = 'https://openrouter.ai/api/frontend/v1/rankings/models?category=programming'

type RankEntry = {
  date: string
  model_permaslug: string
  variant_permaslug: string
  variant: string
  total_prompt_tokens: number
  total_completion_tokens: number
}

function req<T>(runtime: Runtime, url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    runtime.request({
      url,
      method: 'GET',
      timeout: 20000,
      headers: { accept: 'application/json' },
      onload(response) {
        if (response.status && response.status >= 400) {
          reject(new Error(`openrouter: http ${response.status}`))
          return
        }
        try {
          resolve(JSON.parse(response.responseText))
        } catch {
          reject(new Error('openrouter: invalid JSON response'))
        }
      },
      onerror: () => reject(new Error('openrouter: network error')),
      ontimeout: () => reject(new Error('openrouter: timeout')),
    })
  })
}

function extractParameterSize(description: string): string {
  const re =
    /(\d+(?:\.\d+)?[BKMT])\s*(?:active|total)?\s*(?:parameters?|params?)\s*(?:out of\s*(\d+(?:\.\d+)?[BKMT]))?/i
  const m = re.exec(description)
  if (!m) return '?'
  const a = m[1]
  const b = m[2]
  if (b && b !== a) return `${a}/${b}`
  return a
}

export async function fetchOpenRouterModels(runtime: Runtime): Promise<OpenRouterData> {
  const [modelsBody, rankingsBody] = await Promise.all([
    req<{ data: Record<string, unknown>[] }>(runtime, MODELS_URL),
    req<{ data: RankEntry[] }>(runtime, RANKINGS_URL),
  ])

  const rankings = rankingsBody.data ?? []

  // Build lookup: variant_permaslug -> list of rank entries
  const rankBySlug = new Map<string, RankEntry[]>()
  for (const e of rankings) {
    const list = rankBySlug.get(e.variant_permaslug) ?? []
    list.push(e)
    rankBySlug.set(e.variant_permaslug, list)
  }

  // Compute rank for all slug variants by total tokens across all dates
  const slugTotalTokens = new Map<string, number>()
  for (const [slug, entries] of rankBySlug) {
    let total = 0
    for (const e of entries) total += e.total_prompt_tokens + e.total_completion_tokens
    slugTotalTokens.set(slug, total)
  }
  const rankedSlugs = [...slugTotalTokens.entries()].sort((a, b) => b[1] - a[1])
  const rankBySlugTotal = new Map<string, number>()
  rankedSlugs.forEach(([slug], i) => rankBySlugTotal.set(slug, i + 1))

  const free: OpenRouterFreeModel[] = []

  for (const raw of modelsBody.data ?? []) {
    const item = raw as Record<string, unknown>
    const pricing = item.pricing as Record<string, string> | undefined
    if (!pricing || Number(pricing.prompt) !== 0 || Number(pricing.completion) !== 0) continue

    const id = item.id as string
    const canonicalSlug = item.canonical_slug as string
    const isFreeVariant = id.endsWith(':free')

    // Find matching ranking entries
    const targetSlug = isFreeVariant ? `${canonicalSlug}:free` : canonicalSlug
    const entries = rankBySlug.get(targetSlug) ?? []

    // Sum tokens over last 3 unique dates
    const dateSet = new Set<string>()
    for (const e of entries) {
      dateSet.add(e.date.slice(0, 10))
    }
    const last3Dates = [...dateSet].sort().slice(-3)
    let totalTokens: number | null = null
    if (last3Dates.length > 0) {
      totalTokens = 0
      for (const e of entries) {
        if (last3Dates.includes(e.date.slice(0, 10))) {
          totalTokens += e.total_prompt_tokens + e.total_completion_tokens
        }
      }
    }

    const desc = (item.description as string) ?? ''
    const parameterSize = extractParameterSize(desc)
    const provider = id.split('/')[0] ?? '?'

    const contextLength = (item.context_length as number) ?? 0

    const rank = rankBySlugTotal.get(targetSlug) ?? null

    free.push({
      id,
      name: item.name as string,
      contextLength,
      totalTokens3Days: totalTokens,
      parameterSize,
      provider,
      rank,
    })
  }

  free.sort((a, b) => {
    if (a.rank != null && b.rank != null) return a.rank - b.rank
    if (a.rank != null) return -1
    if (b.rank != null) return 1
    return a.id.localeCompare(b.id)
  })
  return { models: free, fetchedAt: new Date().toISOString() }
}
