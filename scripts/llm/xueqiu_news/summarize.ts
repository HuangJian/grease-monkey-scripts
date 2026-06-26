/**
 * Xueqiu News AI Summary — Test Script
 *
 * Validates Plan A: full-quantity LLM summarization using large-context free models.
 * Sends all visible news items to OpenRouter, receives categorized topic summaries.
 *
 * v2: streaming output + prompt improvements
 * - SSE streaming: first byte in ~6s, live progress during generation
 * - Prompt v2: higher coverage, cross-topic dedup, low-importance omits items
 *
 * Key optimizations vs v1:
 * - Sequential indices (0-N) instead of 7-digit original IDs → 5x token reduction on IDs
 * - Comma-separated string "items": "0,3,5" instead of JSON array → no bracket/space overhead
 * - Short JSON keys in output (c/t/s/i/items) → less structural token waste
 * - Stage timing: TTFB (prefill) vs generation, measured via stream events
 * - response_format / stream_options fallback for models that don't support them
 *
 * Usage:
 *   OPENROUTER_API_KEY_FOR_CODEX=sk-or-... bun run scripts/llm/xueqiu_news/summarize.ts
 *
 * Output:
 *   scripts/llm/xueqiu_news/output/<model-safe-name>-raw.txt   (raw LLM response)
 *   scripts/llm/xueqiu_news/output/<model-safe-name>-result.json (parsed + metadata)
 *   scripts/llm/xueqiu_news/output/<model-safe-name>-result.md  (human-readable)
 *   Console: stage timing + token usage + side-by-side comparison
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---- Types ----

type RawNewsItem = {
  id: number
  t: string
  x: string
  u: string
  c: number
  r: number
  d: string
}

type SummaryTopic = {
  category: string
  title: string
  summary: string
  importance: 'high' | 'medium' | 'low'
  itemIds: number[] // resolved back to original IDs
}

type SummaryResult = {
  topics: SummaryTopic[]
}

type ApiUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

type TimingInfo = {
  ttfbMs: number // time to first byte (request → response headers)
  bodyMs: number // response body download time (headers → full body)
  totalMs: number // total elapsed
}

type ModelResult = {
  model: string
  success: boolean
  result: SummaryResult | null
  rawResponse: string
  usage: ApiUsage | null
  timing: TimingInfo | null
  finishReason: string | null
  error: string | null
}

// ---- Config ----

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(SCRIPT_DIR, 'output')
const DATA_FILE = join(SCRIPT_DIR, '..', '..', '..', 'xueqiu-news-2026-06-25.json')

const MODELS = ['openrouter/owl-alpha']

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const API_KEY = process.env['OPENROUTER_API_KEY_FOR_CODEX']

if (!API_KEY) {
  console.error('Error: OPENROUTER_API_KEY_FOR_CODEX environment variable not set')
  process.exit(1)
}

// ---- Prompt building ----

const SYSTEM_PROMPT = `你是一个专业的财经新闻编辑助手。你的任务是对一组雪球 7x24 快讯进行整合、归类、去重和摘要。

规则：
1. 将相关新闻按主题归类（如"地缘政治"、"宏观经济"、"A股"、"商品"、"科技"等），主题数量控制在 15-20 个
2. 同一事件的多次跟进报道合并为一个主题条目（如不同日期的病例数更新、价格变动等）
3. 每个主题生成 ≤100 字的摘要，突出关键信息和趋势，整合多条报道的核心内容
4. 仅省略以下低价值内容：纯个股涨跌、重复的经济数据公布、无实质内容的一行快讯；其余有信息量的新闻尽量归入相应主题
5. 按重要性排序：影响市场走势的 > 政策变动 > 行业动态 > 个股消息
6. 每个主题标注 importance: high/medium/low
7. 禁止将同一条新闻归入多个主题。如果一条新闻涉及多个领域，选择最主要的那个主题归入
8. 条数 <5 的主题合并到上级分类，不要单独成主题
9. high 和 medium 重要性主题用 "items" 字段列出包含的新闻序号（输入中的 "i" 值），用逗号分隔的字符串
10. low 重要性主题不带 "items" 字段

输出紧凑 JSON（不要换行缩进）：
{"topics":[{"c":"分类","t":"标题","s":"摘要","i":"high","items":"0,3,5,7"},{"c":"分类","t":"标题","s":"摘要","i":"low"}]}`

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function buildUserPrompt(items: RawNewsItem[]): string {
  // Compact JSON: sequential index + cleaned text only
  // Using "i" for index (0-N) instead of 7-digit original IDs
  const compact = items.map((item, idx) => ({
    i: idx,
    x: stripHtml(item.x),
  }))
  return `以下是按时间倒序排列的新闻列表（共 ${items.length} 条）。输入中的 "i" 是序号，请在输出的 "items" 中引用这些序号：
${JSON.stringify(compact)}`
}

// ---- API call with streaming + stage timing ----

async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
): Promise<{
  content: string
  usage: ApiUsage | null
  finishReason: string | null
  timing: TimingInfo
}> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 65536,
    stream: true,
    stream_options: { include_usage: true },
  }

  // Some models support response_format, some don't — try with it first
  body['response_format'] = { type: 'json_object' }

  let reqStart = Date.now()

  let resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  // If response_format / stream_options rejected (400), retry without them
  if (resp.status === 400) {
    const errText = await resp.text()
    if (
      errText.includes('response_format') ||
      errText.includes('response format') ||
      errText.includes('stream_options')
    ) {
      console.error(
        `  ⚠️ Unsupported parameter, retrying without response_format/stream_options...`,
      )
      delete body['response_format']
      delete body['stream_options']
      reqStart = Date.now()
      resp = await fetch(API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
    } else {
      throw new Error(`HTTP 400: ${errText.slice(0, 500)}`)
    }
  }

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 500)}`)
  }

  if (!resp.body) throw new Error('Response body is null')

  // Read SSE stream with live progress
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let usage: ApiUsage | null = null
  let finishReason: string | null = null
  let ttfbMs = 0
  let topicCount = 0
  let firstByte = true

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    if (firstByte) {
      ttfbMs = Date.now() - reqStart
      firstByte = false
      console.error(`  ⏳ First byte in ${(ttfbMs / 1000).toFixed(1)}s, streaming...`)
    }

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const chunk: any = JSON.parse(data)
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) {
          content += delta.content
          // Detect topic titles for progress display
          const newCount = (content.match(/"t":"/g) ?? []).length
          if (newCount > topicCount) {
            topicCount = newCount
            process.stderr.write(`\r  📝 ${topicCount} topics, ${content.length} chars...     `)
          }
        }
        if (chunk.choices?.[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason
        }
        if (chunk.usage) {
          usage = chunk.usage
        }
      } catch {
        // Ignore partial JSON in incomplete chunks
      }
    }
  }

  const totalMs = Date.now() - reqStart
  const genMs = totalMs - ttfbMs

  // Clear progress line
  if (!firstByte) {
    process.stderr.write('\r' + ' '.repeat(60) + '\r')
  }

  return {
    content,
    usage,
    finishReason,
    timing: { ttfbMs, bodyMs: genMs, totalMs },
  }
}

// ---- Result parsing ----

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
  itemIds?: number[]
}

function parseSummary(content: string, news: RawNewsItem[]): SummaryResult | null {
  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (match) {
      try {
        parsed = JSON.parse(match[1]!)
      } catch {
        return null
      }
    }
    if (!parsed) return null
  }

  const rawTopics: RawTopic[] = parsed.topics ?? (Array.isArray(parsed) ? parsed : [])
  if (!Array.isArray(rawTopics) || rawTopics.length === 0) return null

  const topics: SummaryTopic[] = rawTopics.map((rt) => {
    const items = rt.items ?? ''
    // Parse comma-separated index string → resolve to original IDs
    const indices: number[] = items
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n < news.length)

    const itemIds = indices.map((idx) => news[idx]!.id)

    // Also handle legacy itemIds array format
    if (itemIds.length === 0 && rt.itemIds && Array.isArray(rt.itemIds)) {
      itemIds.push(...rt.itemIds)
    }

    return {
      category: rt.c ?? rt.category ?? '未分类',
      title: rt.t ?? rt.title ?? '',
      summary: rt.s ?? rt.summary ?? '',
      importance: (rt.i ?? rt.importance ?? 'low') as 'high' | 'medium' | 'low',
      itemIds,
    }
  })

  return { topics }
}

// ---- Output formatting ----

function formatMarkdown(result: SummaryResult): string {
  const importanceEmoji: Record<string, string> = {
    high: '🔴',
    medium: '🟡',
    low: '⚪',
  }

  const lines: string[] = []
  lines.push(`# 雪球 News AI 摘要`)
  lines.push(``)
  const allIds = new Set(result.topics.flatMap((t) => t.itemIds))
  lines.push(`> 共 ${result.topics.length} 个主题，整合自 ${allIds.size} 条原始新闻`)
  lines.push(``)

  const byImportance: Record<string, SummaryTopic[]> = {
    high: [],
    medium: [],
    low: [],
  }
  for (const topic of result.topics) {
    const bucket = byImportance[topic.importance] ?? byImportance['low']!
    bucket.push(topic)
  }

  for (const level of ['high', 'medium', 'low'] as const) {
    const topics = byImportance[level]!
    if (topics.length === 0) continue
    lines.push(`---`)
    lines.push(``)
    for (const topic of topics) {
      const emoji = importanceEmoji[topic.importance] ?? '⚪'
      lines.push(`## ${emoji} [${topic.category}] ${topic.title}`)
      lines.push(``)
      lines.push(`${topic.summary}`)
      lines.push(``)
      const idsDisplay = topic.itemIds.slice(0, 10).join(', ')
      lines.push(
        `<sub>📎 ${topic.itemIds.length} 条相关 · IDs: ${idsDisplay}${topic.itemIds.length > 10 ? '...' : ''}</sub>`,
      )
      lines.push(``)
    }
  }

  return lines.join('\n')
}

function modelToFileName(model: string): string {
  return model.replace(/[^a-zA-Z0-9_-]/g, '_')
}

// ---- Main ----

async function runModel(model: string, items: RawNewsItem[]): Promise<ModelResult> {
  const userPrompt = buildUserPrompt(items)
  console.error(`\n[${model}]`)
  console.error(`  Items: ${items.length}`)
  console.error(
    `  Prompt size: ${userPrompt.length} chars (~${Math.round(userPrompt.length / 2)} tokens est.)`,
  )

  try {
    const { content, usage, finishReason, timing } = await callOpenRouter(
      model,
      SYSTEM_PROMPT,
      userPrompt,
    )
    console.error(`  Timing:`)
    console.error(`    TTFB (prefill): ${(timing.ttfbMs / 1000).toFixed(1)}s`)
    console.error(`    Generation: ${(timing.bodyMs / 1000).toFixed(1)}s`)
    console.error(`    Total: ${(timing.totalMs / 1000).toFixed(1)}s`)
    console.error(
      `  Usage: prompt=${usage?.prompt_tokens ?? '?'} completion=${usage?.completion_tokens ?? '?'} total=${usage?.total_tokens ?? '?'}`,
    )
    console.error(
      `  Finish reason: ${finishReason ?? '?'}${finishReason === 'length' ? ' (TRUNCATED!)' : ''}`,
    )
    console.error(`  Response length: ${content.length} chars`)

    // Always save raw response for debugging
    const safeName = modelToFileName(model)
    writeFileSync(join(OUTPUT_DIR, `${safeName}-raw.txt`), content)

    const result = parseSummary(content, items)
    if (!result) {
      console.error(`  ⚠️ Failed to parse JSON response`)
      console.error(`  Raw saved to: ${safeName}-raw.txt`)
      console.error(`  Raw (first 300 chars): ${content.slice(0, 300)}`)
      return {
        model,
        success: false,
        result: null,
        rawResponse: content,
        usage,
        timing,
        finishReason,
        error: `JSON parse failed (finish_reason: ${finishReason})`,
      }
    }

    console.error(`  ✅ Parsed: ${result.topics.length} topics`)
    const highCount = result.topics.filter((t) => t.importance === 'high').length
    const medCount = result.topics.filter((t) => t.importance === 'medium').length
    const lowCount = result.topics.filter((t) => t.importance === 'low').length
    console.error(`  Importance: 🔴${highCount} 🟡${medCount} ⚪${lowCount}`)
    const allIds = new Set(result.topics.flatMap((t) => t.itemIds))
    console.error(
      `  Coverage: ${allIds.size}/${items.length} items referenced (${((allIds.size / items.length) * 100).toFixed(0)}%)`,
    )

    return {
      model,
      success: true,
      result,
      rawResponse: content,
      usage,
      timing,
      finishReason,
      error: null,
    }
  } catch (e: any) {
    console.error(`  ❌ Error: ${e.message}`)
    return {
      model,
      success: false,
      result: null,
      rawResponse: '',
      usage: null,
      timing: null,
      finishReason: null,
      error: e.message,
    }
  }
}

async function main() {
  // Load test data
  console.error('Loading test data...')
  const rawData = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  const cacheKey = Object.keys(rawData)[0]!
  const news: RawNewsItem[] = rawData[cacheKey]!.data!.news!
  console.error(`Loaded ${news.length} news items`)

  // Prepare output directory
  mkdirSync(OUTPUT_DIR, { recursive: true })

  // Run both models sequentially (avoid rate limiting)
  const results: ModelResult[] = []
  for (const model of MODELS) {
    const result = await runModel(model, news)
    results.push(result)

    if (result.success && result.result) {
      const safeName = modelToFileName(result.model)
      writeFileSync(
        join(OUTPUT_DIR, `${safeName}-result.json`),
        JSON.stringify(
          {
            model: result.model,
            usage: result.usage,
            timing: result.timing,
            finishReason: result.finishReason,
            result: result.result,
          },
          null,
          2,
        ),
      )
      writeFileSync(join(OUTPUT_DIR, `${safeName}-result.md`), formatMarkdown(result.result))
    }
  }

  // Comparison summary
  console.error('\n' + '='.repeat(70))
  console.error('COMPARISON SUMMARY')
  console.error('='.repeat(70))
  console.error('')

  for (const r of results) {
    console.error(`\n${r.model}`)
    console.error(`  Status: ${r.success ? '✅ Success' : '❌ Failed'}`)
    if (r.error) console.error(`  Error: ${r.error}`)
    if (r.timing) {
      console.error(`  Timing:`)
      console.error(`    TTFB: ${(r.timing.ttfbMs / 1000).toFixed(1)}s`)
      console.error(`    Generation: ${(r.timing.bodyMs / 1000).toFixed(1)}s`)
      console.error(`    Total: ${(r.timing.totalMs / 1000).toFixed(1)}s`)
    }
    if (r.usage) {
      console.error(
        `  Tokens: prompt=${r.usage.prompt_tokens ?? '?'} completion=${r.usage.completion_tokens ?? '?'} total=${r.usage.total_tokens ?? '?'}`,
      )
    }
    if (r.finishReason) {
      console.error(
        `  Finish: ${r.finishReason}${r.finishReason === 'length' ? ' (TRUNCATED!)' : ''}`,
      )
    }
    if (r.result) {
      console.error(`  Topics: ${r.result.topics.length}`)
      const highCount = r.result.topics.filter((t) => t.importance === 'high').length
      const medCount = r.result.topics.filter((t) => t.importance === 'medium').length
      const lowCount = r.result.topics.filter((t) => t.importance === 'low').length
      console.error(`  Importance: 🔴${highCount} 🟡${medCount} ⚪${lowCount}`)
      const allIds = new Set(r.result.topics.flatMap((t) => t.itemIds))
      console.error(
        `  Coverage: ${allIds.size}/${news.length} (${((allIds.size / news.length) * 100).toFixed(0)}%)`,
      )

      const highTopics = r.result.topics.filter((t) => t.importance === 'high').slice(0, 5)
      if (highTopics.length > 0) {
        console.error(`  Top high-importance topics:`)
        for (const t of highTopics) {
          console.error(`    [${t.category}] ${t.title}`)
          console.error(`      ${t.summary.slice(0, 80)}...`)
          console.error(`      📎 ${t.itemIds.length} items`)
        }
      }
    }
  }

  console.error(`\nOutput files saved to: ${OUTPUT_DIR}/`)
}

main().catch((e: any) => {
  console.error(`Fatal: ${e.message}`)
  process.exit(1)
})
