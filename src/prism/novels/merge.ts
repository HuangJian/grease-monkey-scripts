import type { NovelChapter, NovelChapterVariant } from './types'
import { chapterNumber, normalizeTitle } from './chapter-key'

const DEFAULT_THRESHOLD = 20
const DEFAULT_KEEP = 10

const PREFIX_RE = /^\s*第\s*(?:[0-9０-９]+|[一二三四五六七八九十百千两零〇]+)\s*[章节節回话話]/

/** Title with any leading chapter-number prefix removed, used for cross-site text matching. */
function textKeyOf(title: string): string {
  return normalizeTitle(title.replace(PREFIX_RE, ''))
}

type MergeOptions = { collapseThreshold?: number; collapseKeep?: number }

type Node = {
  sourceIndex: number
  pos: number
  variant: NovelChapterVariant
  numKey: string | null
  textKey: string
}

function toNodes(sources: NovelChapterVariant[][]): Node[] {
  const nodes: Node[] = []
  for (let si = 0; si < sources.length; si++) {
    const list = sources[si]!
    for (let pos = 0; pos < list.length; pos++) {
      const v = list[pos]!
      const num = chapterNumber(v.title)
      nodes.push({
        sourceIndex: si,
        pos,
        variant: v,
        numKey: num !== undefined ? `n:${num}` : null,
        textKey: textKeyOf(v.title),
      })
    }
  }
  return nodes
}

export function mergeSourceChapters(
  sources: NovelChapterVariant[][],
  seenKey = '',
  options: MergeOptions = {},
): NovelChapter[] {
  const collapseThreshold = options.collapseThreshold ?? DEFAULT_THRESHOLD
  const collapseKeep = options.collapseKeep ?? DEFAULT_KEEP

  if (sources.length === 0 || sources.every((s) => s.length === 0)) return []

  const nodes = toNodes(sources)
  const parent = nodes.map((_, i) => i)
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) {
      parent[r] = parent[parent[r]]!
      r = parent[r]!
    }
    return r
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  // Numbered chapters merge by their chapter number.
  const numMap = new Map<string, number>()
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    if (n.numKey) {
      const prev = numMap.get(n.numKey)
      if (prev === undefined) numMap.set(n.numKey, i)
      else union(i, prev)
    }
  }

  // Text-bridging: unnumbered↔unnumbered, and exactly-one-numbered↔unnumbered.
  // Two numbered chapters only merge by number (handled above), never by text.
  const textMap = new Map<string, number[]>()
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    const arr = textMap.get(n.textKey) ?? []
    arr.push(i)
    textMap.set(n.textKey, arr)
  }
  for (const arr of textMap.values()) {
    for (let a = 0; a < arr.length; a++) {
      for (let b = a + 1; b < arr.length; b++) {
        const na = nodes[arr[a]!]!
        const nb = nodes[arr[b]!]!
        if (na.numKey !== null && nb.numKey !== null) continue
        union(arr[a]!, arr[b]!)
      }
    }
  }

  const compNodes = new Map<number, number[]>()
  for (let i = 0; i < nodes.length; i++) {
    const root = find(i)
    const arr = compNodes.get(root) ?? []
    arr.push(i)
    compNodes.set(root, arr)
  }

  const buildChapter = (idxs: number[]): NovelChapter => {
    const sorted = idxs
      .map((i) => nodes[i]!)
      .sort((a, b) => a.sourceIndex - b.sourceIndex || a.pos - b.pos)
    const titleNode = sorted[0]!
    let postedAt = 0
    for (const n of sorted) {
      if (n.variant.postedAt > 0) {
        postedAt = n.variant.postedAt
        break
      }
    }
    const numbered = sorted.find((n) => n.numKey !== null)
    return {
      key: numbered ? numbered.numKey! : `t:${sorted[0]!.textKey}`,
      number: numbered ? chapterNumber(numbered.variant.title) : undefined,
      title: titleNode.variant.title,
      postedAt,
      variants: sorted.map((n) => n.variant),
    }
  }

  // Spine = source listing the most chapters (tie: lowest index) drives order.
  let spineIdx = 0
  for (let i = 1; i < sources.length; i++) {
    if (sources[i]!.length > sources[spineIdx]!.length) spineIdx = i
  }

  const out: NovelChapter[] = []
  const emitted = new Set<number>()
  for (const v of sources[spineIdx]!) {
    const nodeIdx = nodes.findIndex((n) => n.sourceIndex === spineIdx && n.variant === v)
    const root = find(nodeIdx)
    if (emitted.has(root)) continue
    emitted.add(root)
    out.push(buildChapter(compNodes.get(root)!))
  }

  // Extras: components without a spine node, ordered by how far each source reaches.
  type Extra = { sourceIndex: number; count: number; chapter: NovelChapter }
  const extras: Extra[] = []
  for (let si = 0; si < sources.length; si++) {
    if (si === spineIdx) continue
    for (const v of sources[si]!) {
      const nodeIdx = nodes.findIndex((n) => n.sourceIndex === si && n.variant === v)
      const root = find(nodeIdx)
      if (emitted.has(root)) continue
      emitted.add(root)
      extras.push({
        sourceIndex: si,
        count: sources[si]!.length,
        chapter: buildChapter(compNodes.get(root)!),
      })
    }
  }
  extras.sort((x, y) => y.count - x.count || x.sourceIndex - y.sourceIndex)
  // Prepend every source's extras as a block so each source keeps its own
  // internal (newest-first) order; per-element unshift would reverse them.
  out.unshift(...extras.map((e) => e.chapter))

  let trimmed = out
  if (seenKey) {
    const idx = out.findIndex((c) => c.key === seenKey)
    if (idx >= 0) trimmed = out.slice(0, idx + 1)
  }
  return collapseChapters(trimmed, seenKey, { collapseThreshold, collapseKeep })
}

/**
 * Collapse a long unread run: keep the latest and earliest `keep` chapters with
 * a single gap marker between them, plus the seen boundary chapter.
 */
export function collapseChapters(
  chapters: NovelChapter[],
  seenKey: string,
  options: { collapseThreshold?: number; collapseKeep?: number } = {},
): NovelChapter[] {
  const threshold = options.collapseThreshold ?? DEFAULT_THRESHOLD
  const keep = options.collapseKeep ?? DEFAULT_KEEP
  if (chapters.length === 0) return chapters
  const seenIdx = seenKey ? chapters.findIndex((c) => c.key === seenKey) : -1
  const unread = seenIdx >= 0 ? chapters.slice(0, seenIdx) : chapters
  if (unread.length <= threshold) return chapters
  const latest = unread.slice(0, keep)
  const earliest = unread.slice(unread.length - keep)
  const omitted = Math.max(unread.length - threshold, 0)
  const gap: NovelChapter = { key: '', title: '', postedAt: 0, variants: [], omittedCount: omitted }
  const result: NovelChapter[] = [...latest, gap, ...earliest]
  if (seenIdx >= 0) result.push(chapters[seenIdx]!)
  return result
}
