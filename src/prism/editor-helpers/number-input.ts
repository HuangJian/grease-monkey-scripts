export type NumericRule = {
  min: number
  max?: number
  integer?: boolean
  errorMessage: string
}

export type NumericValidationResult = { ok: true; value: number } | { ok: false; error: string }

export function validateNumberInput(raw: string, rule: NumericRule): NumericValidationResult {
  const n = Number(raw)
  if (!Number.isFinite(n)) return { ok: false, error: rule.errorMessage }
  if (rule.integer && !Number.isInteger(n)) return { ok: false, error: rule.errorMessage }
  if (n < rule.min) return { ok: false, error: rule.errorMessage }
  if (rule.max !== undefined && n > rule.max) return { ok: false, error: rule.errorMessage }
  return { ok: true, value: n }
}

export type NumberFieldRule = {
  input: HTMLInputElement
  min: number
  max?: number
  integer?: boolean
  errorMessage: string
}

export function readNumberFields(
  fields: ReadonlyArray<NumberFieldRule>,
  onError: (message: string) => void,
): number[] | null {
  const out: number[] = []
  for (const f of fields) {
    const r = validateNumberInput(f.input.value, f)
    if (!r.ok) {
      onError(r.error)
      return null
    }
    out.push(r.value)
  }
  return out
}
