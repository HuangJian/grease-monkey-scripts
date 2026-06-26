/**
 * Xueqiu News Summary Quality Analyzer
 *
 * Analyzes a model's summary output for coverage, cross-topic duplication,
 * topic distribution, and unreferenced items. Used to evaluate and tune
 * the summarization prompt.
 *
 * Usage:
 *   bun run scripts/llm/xueqiu_news/analyze.ts [model-name]
 *   # model-name defaults to "openrouter/owl-alpha"
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---- Config ----

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(SCRIPT_DIR, 'output')
const DATA_FILE = join(SCRIPT_DIR, '..', '..', '..', 'xueqiu-news-2026-06-25.json')

const MODEL_NAME = process.argv[2] ?? 'openrouter/owl-alpha'

function modelToFileName(model: string): string {
  return model.replace(/[^a-zA-Z0-9_-]/g, '_')
}

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

// ---- Main ----

function main() {
  const safeName = modelToFileName(MODEL_NAME)

  // Load source news
  const rawData = JSON.parse(readFileSync(DATA_FILE, 'utf-8'))
  const cacheKey = Object.keys(rawData)[0]!
  const news: RawNewsItem[] = rawData[cacheKey]!.data!.news!

  // Load parsed result
  const resultFile = JSON.parse(readFileSync(join(OUTPUT_DIR, `${safeName}-result.json`), 'utf-8'))
  const topics: any[] = resultFile.result.topics

  // Load raw response to get index strings (before ID resolution)
  const rawTxt = readFileSync(join(OUTPUT_DIR, `${safeName}-raw.txt`), 'utf-8')
  const rawParsed = JSON.parse(rawTxt)
  const topicIndices: number[][] = rawParsed.topics.map((t: any) =>
    String(t.items ?? '')
      .split(',')
      .map((s: string) => parseInt(s.trim(), 10))
      .filter((n: number) => Number.isFinite(n) && n >= 0 && n < news.length),
  )

  console.log(`\n${'='.repeat(70)}`)
  console.log(`Summary Quality Analysis: ${MODEL_NAME}`)
  console.log(`${'='.repeat(70)}\n`)

  // 1. Coverage
  const allReferenced = new Set<number>()
  for (const idxs of topicIndices) for (const i of idxs) allReferenced.add(i)
  console.log(`─ Coverage ─`)
  console.log(`  Total items:       ${news.length}`)
  console.log(
    `  Unique referenced: ${allReferenced.size} (${((allReferenced.size / news.length) * 100).toFixed(1)}%)`,
  )
  console.log(`  Not referenced:    ${news.length - allReferenced.size}`)

  // 2. Cross-topic duplication
  const itemToTopics = new Map<number, number[]>()
  topicIndices.forEach((idxs, ti) => {
    for (const i of idxs) {
      if (!itemToTopics.has(i)) itemToTopics.set(i, [])
      itemToTopics.get(i)!.push(ti)
    }
  })
  const dups = [...itemToTopics.entries()].filter(([, ts]) => ts.length > 1)
  console.log(`\n─ Cross-topic Duplication ─`)
  console.log(`  Items in multiple topics: ${dups.length}`)
  for (const [item, ts] of dups) {
    const titles = ts.map((t) => topics[t]!.title).join(' | ')
    const text = news[item]!.x.replace(/<[^>]+>/g, '').slice(0, 80)
    console.log(`  [${item}] (${ts.length}x) -> ${titles}`)
    console.log(`    text: ${text}...`)
  }

  // 3. Topic distribution
  console.log(`\n─ Topic Distribution ─`)
  const byImportance: Record<string, number> = { high: 0, medium: 0, low: 0 }
  topicIndices.forEach((idxs, ti) => {
    const imp = topics[ti]!.importance ?? 'low'
    byImportance[imp] = (byImportance[imp] ?? 0) + 1
  })
  console.log(
    `  Topics: ${topics.length} (🔴${byImportance.high} 🟡${byImportance.medium} ⚪${byImportance.low})`,
  )
  console.log(`  Items per topic:`)
  topicIndices.forEach((idxs, ti) => {
    const t = topics[ti]!
    const flag = t.importance === 'high' ? '🔴' : t.importance === 'medium' ? '🟡' : '⚪'
    console.log(`    ${flag} ${t.category}/${t.title}: ${idxs.length} items`)
  })
  const sorted = [...topicIndices].sort((a, b) => a.length - b.length)
  console.log(
    `\n  Min: ${sorted[0]!.length}, Max: ${sorted[sorted.length - 1]!.length}, Median: ${sorted[Math.floor(sorted.length / 2)]!.length}`,
  )

  // 4. Unreferenced items sample
  const unreferenced = news.map((_, i) => i).filter((i) => !allReferenced.has(i))
  console.log(`\n─ Unreferenced Items (sample of 20) ─`)
  for (const i of unreferenced.slice(0, 20)) {
    const text = news[i]!.x.replace(/<[^>]+>/g, '').slice(0, 90)
    console.log(`  [${i}] ${text}`)
  }
}

main()
