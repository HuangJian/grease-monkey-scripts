import type { Runtime } from '../../../runtime'
import type { SummaryEntry, SummaryTopic, XueqiuAiConfig, XueqiuNewsItem } from '../types'
import { buildSystemPrompt, buildUserPrompt } from './prompt'

const SUMMARIES_KEY = 'gm:xueqiu:ai-summaries'

// ---------------------------------------------------------------------------
// Summary storage (history list with expiry)
// ---------------------------------------------------------------------------

export async function loadSummaries(
  runtime: Runtime,
  retentionMs: number,
): Promise<SummaryEntry[]> {
  try {
    const raw = await runtime.getValue<unknown>(SUMMARIES_KEY, null)
    if (!Array.isArray(raw)) return []
    const now = Date.now()
    const entries = (raw as SummaryEntry[]).filter((e) => now - e.generatedAt < retentionMs)
    // Persist pruned list if entries were removed
    if (entries.length !== (raw as SummaryEntry[]).length) {
      void runtime.setValue(SUMMARIES_KEY, entries)
    }
    return entries.sort((a, b) => b.generatedAt - a.generatedAt)
  } catch {
    return []
  }
}

export async function saveSummary(runtime: Runtime, entry: SummaryEntry): Promise<void> {
  let existing: SummaryEntry[] = []
  try {
    const raw = await runtime.getValue<unknown>(SUMMARIES_KEY, null)
    if (Array.isArray(raw)) existing = raw as SummaryEntry[]
  } catch {
    /* ignore */
  }
  const updated = [entry, ...existing].slice(0, 100)
  void runtime.setValue(SUMMARIES_KEY, updated)
}

// ---------------------------------------------------------------------------
// LLM API call (non-streaming via GM_xmlhttpRequest)
// ---------------------------------------------------------------------------

type RawTopic = {
  c?: string
  category?: string
  t?: string
  title?: string
  s?: string
  summary?: string
  i?: string
  importance?: string
  items?: string
}

export function parseSummary(content: string, itemCount: number): SummaryTopic[] {
  let parsed: { topics?: RawTopic[] } | RawTopic[] | null = null
  try {
    parsed = JSON.parse(content)
  } catch {
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) {
      try {
        parsed = JSON.parse(match[1]!)
      } catch {
        return []
      }
    }
  }
  if (!parsed) return []

  const rawTopics: RawTopic[] = Array.isArray(parsed) ? parsed : (parsed.topics ?? [])
  if (!Array.isArray(rawTopics) || rawTopics.length === 0) return []

  return rawTopics.map((rt) => {
    const itemsStr = rt.items ?? ''
    const indices: number[] = itemsStr
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n < itemCount)

    return {
      category: rt.c ?? rt.category ?? '未分类',
      title: rt.t ?? rt.title ?? '',
      summary: rt.s ?? rt.summary ?? '',
      importance: (rt.i ?? rt.importance ?? 'low') as 'high' | 'medium' | 'low',
      items: indices,
    }
  })
}

function gmRequest(
  runtime: Runtime,
  config: XueqiuAiConfig,
  body: Record<string, unknown>,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    runtime.request({
      url: config.apiUrl,
      method: 'POST',
      timeout: 300_000,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      data: JSON.stringify(body),
      onload(resp) {
        resolve({ status: resp.status, text: resp.responseText })
      },
      onerror: () => reject(new Error('AI 摘要: 网络错误')),
      ontimeout: () => reject(new Error('AI 摘要: 请求超时')),
    })
  })
}

export type SummarizeResult = {
  topics: SummaryTopic[]
  elapsedMs: number
  itemCount: number
}

export async function summarize(
  runtime: Runtime,
  items: XueqiuNewsItem[],
  config: XueqiuAiConfig,
): Promise<SummarizeResult> {
  const systemPrompt = buildSystemPrompt(config.systemPrompt)
  const userPrompt = buildUserPrompt(items)

  const body: Record<string, unknown> = {
    model: config.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 65536,
    response_format: { type: 'json_object' },
  }

  const startMs = Date.now()
  let resp = await gmRequest(runtime, config, body)

  // Fallback: some providers reject response_format
  if (resp.status === 400 && resp.text.includes('response_format')) {
    delete body['response_format']
    resp = await gmRequest(runtime, config, body)
  }

  if (resp.status >= 400) {
    throw new Error(`HTTP ${resp.status}: ${resp.text.slice(0, 300)}`)
  }

  let content: string
  try {
    const data = JSON.parse(resp.text) as { choices?: { message?: { content?: string } }[] }
    content = data.choices?.[0]?.message?.content ?? ''
  } catch {
    throw new Error('AI 摘要: 响应解析失败')
  }

  if (!content) throw new Error('AI 摘要: 空响应')

  const topics = parseSummary(content, items.length)
  if (topics.length === 0) throw new Error('AI 摘要: 无有效主题')

  // Resolve indices → original item IDs so past summaries stay valid
  for (const topic of topics) {
    topic.items = topic.items.map((idx) => items[idx]?.id ?? -1).filter((id) => id >= 0)
  }
  return { topics, elapsedMs: Date.now() - startMs, itemCount: items.length }
}

/** Build a SummaryEntry from summarize result. */
export function buildSummaryEntry(result: SummarizeResult): SummaryEntry {
  const allItems = new Set<number>()
  for (const t of result.topics) for (const i of t.items) allItems.add(i)
  const now = Date.now()
  return {
    id: String(now),
    generatedAt: now,
    topics: result.topics,
    newsCount: allItems.size,
    itemCount: result.itemCount,
    elapsedMs: result.elapsedMs,
  }
}
