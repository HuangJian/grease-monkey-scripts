/**
 * CMA helper functions.
 *
 * Utility functions for parsing CMA data.
 */
import { CMA_ICON_TO_CODE, CMA_TEXT_TO_CODE, BEAUFORT_MIDPOINT_MS, MISSING_TEMP } from './constants'

export function parseTemp(text: string): number | null {
  const m = text.trim().match(/^(-?[\d.]+)/)
  if (!m) return null
  const n = parseFloat(m[1]!)
  if (!Number.isFinite(n) || n >= MISSING_TEMP) return null
  return n
}

export function codeFromIcon(img: Element | null | undefined): number | null {
  if (!img) return null
  return codeFromIconSrc(img.getAttribute('src') ?? '')
}

export function codeFromIconSrc(src: string): number | null {
  const m = src.match(/\/w(\d+)\.png$/)
  if (!m) return null
  return CMA_ICON_TO_CODE[`w${m[1]!}`] ?? null
}

export function codeFromText(text: string): number | null {
  const t = text.trim()
  const found = Object.entries(CMA_TEXT_TO_CODE).find(([k]) => t.includes(k))
  return found ? found[1] : null
}

export function numOrNull(v: unknown): number | null {
  if (typeof v !== 'number') return null
  if (!Number.isFinite(v) || v >= MISSING_TEMP) return null
  return v
}

export function parseBeaufortText(text: string): number | null {
  const m = text.match(/^(\d{1,2})级/)
  if (!m) return null
  const idx = parseInt(m[1]!, 10)
  return BEAUFORT_MIDPOINT_MS[idx] ?? null
}

export function nextDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00`)
  d.setDate(d.getDate() + 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function extractIconSrcs(row: Element): string[] {
  const cells = row.querySelectorAll('td.wicon img')
  return Array.from(cells).map((c) => c.getAttribute('src') ?? '')
}

export function extractNumberCells(row: Element, suffix: RegExp): number[] {
  const cells = row.querySelectorAll('td')
  const out: number[] = []
  cells.forEach((c, i) => {
    if (i === 0) return
    const t = (c.textContent ?? '').trim().replace(suffix, '')
    const n = parseFloat(t)
    if (Number.isFinite(n)) out.push(n)
  })
  return out
}

export function extractTextCells(row: Element): string[] {
  const cells = Array.from(row.querySelectorAll('td')).slice(1)
  return cells.map((c) => (c.textContent ?? '').trim())
}

export function extractPrecipCells(row: Element): number[] {
  const cells = row.querySelectorAll('td')
  const out: number[] = []
  // 用负值标记"无降水"，累加时过滤掉，避免 null 污染 number[] 类型
  const NO_PRECIP = -0.000000001
  cells.forEach((c, i) => {
    if (i === 0) return
    const t = (c.textContent ?? '').trim()
    if (t === '无降水' || t === '--') {
      out.push(NO_PRECIP)
      return
    }
    const m = t.match(/^([\d.]+)mm$/)
    out.push(m ? parseFloat(m[1]!) : NO_PRECIP)
  })
  return out
}
