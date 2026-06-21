/**
 * OpenRouter free models test script.
 *
 * Fetches models from the programming category (public API, no auth),
 * merges with daily token usage from the rankings API, and shows
 * free models with their 3-day token totals and parameter sizes.
 *
 * Usage:
 *   bun run scripts/fetchers/openrouter-test.ts
 */

const MODELS_URL = 'https://openrouter.ai/api/v1/models?category=programming'
const RANKINGS_URL = 'https://openrouter.ai/api/frontend/v1/rankings/models?category=programming'

type FreeModel = {
  id: string
  name: string
  contextLength: number
  totalTokens3Days: number | null
  parameterSize: string
  provider: string
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

async function fetchFreeModels(): Promise<FreeModel[]> {
  const [modelsResp, rankingsResp] = await Promise.all([
    fetch(MODELS_URL, { headers: { Accept: 'application/json' } }),
    fetch(RANKINGS_URL, { headers: { Accept: 'application/json' } }),
  ])

  if (!modelsResp.ok) throw new Error(`models API HTTP ${modelsResp.status}`)
  if (!rankingsResp.ok) throw new Error(`rankings API HTTP ${rankingsResp.status}`)

  const modelsBody: any = await modelsResp.json()
  const rankingsBody: any = await rankingsResp.json()

  const rankings: any[] = rankingsBody.data ?? []

  // Build lookup: variant_permaslug -> entries
  const rankBySlug = new Map<string, any[]>()
  for (const e of rankings) {
    const list = rankBySlug.get(e.variant_permaslug) ?? []
    list.push(e)
    rankBySlug.set(e.variant_permaslug, list)
  }

  const free: FreeModel[] = []

  for (const item of modelsBody.data ?? []) {
    const pricing = item.pricing ?? {}
    if (Number(pricing.prompt) !== 0 || Number(pricing.completion) !== 0) continue

    const id: string = item.id
    const canonicalSlug: string = item.canonical_slug
    const isFreeVariant = id.endsWith(':free')
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

    const desc: string = item.description ?? ''
    const parameterSize = extractParameterSize(desc)
    const provider = id.split('/')[0] ?? '?'

    const contextLength = item.context_length ?? 0
    free.push({
      id,
      name: item.name,
      contextLength,
      totalTokens3Days: totalTokens,
      parameterSize,
      provider,
    })
  }

  free.sort((a, b) => a.id.localeCompare(b.id))
  return free
}

function fmtTokens(n: number | null): string {
  if (n === null) return 'N/A'
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return String(n)
}

async function main() {
  console.error('Fetching OpenRouter programming models...')
  const models = await fetchFreeModels()

  console.error(`\nTotal free models: ${models.length}`)
  console.error('')
  console.error(
    `${'Name'.padEnd(40)} ${'Tokens(3d)'.padEnd(12)} ${'Params'.padEnd(14)} ${'Ctx'.padEnd(10)} Provider`,
  )
  console.error('─'.repeat(85))
  for (const m of models) {
    const name = m.name.length > 36 ? m.name.slice(0, 33) + '...' : m.name
    const ctx = m.contextLength > 0 ? `${(m.contextLength / 1024).toFixed(0)}k` : '?'
    console.error(
      `${name.padEnd(40)} ${fmtTokens(m.totalTokens3Days).padEnd(12)} ${m.parameterSize.padEnd(14)} ${ctx.padEnd(10)} ${m.provider}`,
    )
  }

  console.error('')
  console.error('--- JSON ---')
  console.log(JSON.stringify(models, null, 2))
}

main().catch((e: any) => {
  console.error(`Error: ${e.message}`)
  process.exit(1)
})
