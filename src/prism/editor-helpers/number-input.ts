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

/**
 * Field definition that drives both the display label and the validation
 * error message, eliminating text duplication between the two.
 */
export type NumberFieldDef = {
  prop: string
  name: string
  unit?: string
  min: number
  max?: number
  integer?: boolean
  placeholder?: string
}

export function fieldLabel(f: NumberFieldDef): string {
  return f.unit ? `${f.name}（${f.unit}）` : f.name
}

export function fieldErrorMsg(f: NumberFieldDef): string {
  const sp = /[a-zA-Z0-9]$/.test(f.name) ? ' ' : ''
  if (f.max !== undefined) {
    return f.integer
      ? `${f.name}${sp}必须是 ${f.min}~${f.max} 之间的整数`
      : `${f.name}${sp}必须是 ${f.min}~${f.max} 之间`
  }
  return f.integer ? `${f.name}${sp}必须是 ≥${f.min} 的整数` : `${f.name}${sp}必须 ≥${f.min}`
}

export function toFieldRule(input: HTMLInputElement, f: NumberFieldDef): NumberFieldRule {
  return { input, min: f.min, max: f.max, integer: f.integer, errorMessage: fieldErrorMsg(f) }
}
