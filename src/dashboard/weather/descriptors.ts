/**
 * Human-readable precipitation label (single character).
 * Returns null when there is no meaningful precipitation (0 or absent).
 */
export function precipLabel(mm: number | null | undefined, period: 'hour' | 'day'): string | null {
  if (mm == null || mm <= 0 || !Number.isFinite(mm)) return null

  if (period === 'hour') {
    if (mm < 1) return '微'
    if (mm < 4) return '小'
    if (mm < 10) return '中'
    if (mm < 25) return '大'
    return '暴'
  }

  // day
  if (mm < 1) return '微'
  if (mm < 10) return '小'
  if (mm < 25) return '中'
  if (mm < 50) return '大'
  return '暴'
}

/**
 * Human-readable wind speed label (single character).
 * Returns null when speed is absent.
 */
export function windLabel(kmh: number | null | undefined): string | null {
  if (kmh == null || !Number.isFinite(kmh)) return null
  if (kmh < 6) return '静'
  if (kmh < 12) return '微'
  if (kmh < 20) return '和'
  if (kmh < 29) return '清'
  if (kmh < 39) return '强'
  if (kmh < 50) return '劲'
  return '大'
}
