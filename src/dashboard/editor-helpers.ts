import type { Runtime } from '../runtime'
import { CONFIG_KEY } from './types'
import type { ConfigValidation } from './config'

export type ErrorBox = {
  show(message: string): void
  clear(): void
}

export function bindErrorBox(errorEl: HTMLElement): ErrorBox {
  return {
    show(message) {
      errorEl.textContent = message
      errorEl.hidden = false
    },
    clear() {
      errorEl.textContent = ''
      errorEl.hidden = true
    },
  }
}

export type SaveConfigSectionArgs<T> = {
  runtime: Runtime
  sectionKey: string
  section: T
  validate: (merged: Record<string, unknown>) => ConfigValidation
  onError: (message: string) => void
  onSuccess: () => void
}

export async function saveConfigSection<T>(args: SaveConfigSectionArgs<T>): Promise<void> {
  const validation = args.validate({ [args.sectionKey]: args.section })
  if (!validation.ok) {
    args.onError(validation.error)
    return
  }
  const result = args.runtime
    .getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    .then((existing) => {
      return args.runtime.setValue(CONFIG_KEY, {
        ...(existing ?? {}),
        [args.sectionKey]: args.section,
      })
    })
  Promise.resolve(result).then(() => {
    args.onSuccess()
  })
}

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
