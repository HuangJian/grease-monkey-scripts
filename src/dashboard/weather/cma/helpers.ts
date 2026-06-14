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
  for (const [k, v] of Object.entries(CMA_TEXT_TO_CODE)) {
    if (t.includes(k)) return v
  }
  return null
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
  for (let i = 1; i < cells.length; i++) {
    const t = (cells[i]?.textContent ?? '').trim().replace(suffix, '')
    const n = parseFloat(t)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

export function extractTextCells(row: Element): string[] {
  const cells = row.querySelectorAll('td')
  const out: string[] = []
  for (let i = 1; i < cells.length; i++) {
    out.push((cells[i]?.textContent ?? '').trim())
  }
  return out
}

export function extractPrecipCells(row: Element): (number | null)[] {
  const cells = row.querySelectorAll('td')
  const out: (number | null)[] = []
  for (let i = 1; i < cells.length; i++) {
    const t = (cells[i]?.textContent ?? '').trim()
    if (t === '无降水' || t === '--') {
      out.push(null)
      continue
    }
    const m = t.match(/^([\d.]+)mm$/)
    if (m) {
      out.push(parseFloat(m[1]!))
    } else {
      out.push(null)
    }
  }
  return out
}
