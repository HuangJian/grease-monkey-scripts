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

export type ChipListArgs<T> = {
  listEl: HTMLElement
  addBtn: HTMLButtonElement
  inputs: ReadonlyArray<HTMLInputElement>
  getItems: () => ReadonlyArray<T>
  setItems: (items: T[]) => void
  renderChip: (item: T, index: number) => string
  removeSelector: string
  tryAdd: () => { ok: true; item: T } | { ok: false; error: string }
  showError: (message: string) => void
  clearError: () => void
  emptyText: string
  emptyClass: string
}

export type ChipListHandle = {
  render(): void
}

export function bindChipList<T>(args: ChipListArgs<T>): ChipListHandle {
  function renderList(): void {
    args.listEl.replaceChildren()
    const items = args.getItems()
    if (items.length === 0) {
      args.listEl.insertAdjacentHTML(
        'beforeend',
        `<div class="${args.emptyClass}">${args.emptyText}</div>`,
      )
      return
    }
    args.listEl.insertAdjacentHTML(
      'beforeend',
      items.map((item, i) => args.renderChip(item, i)).join(''),
    )
    args.listEl.querySelectorAll<HTMLElement>(args.removeSelector).forEach((el, i) => {
      el.addEventListener('click', () => {
        const next = args.getItems().filter((_, idx) => idx !== i)
        args.setItems(next)
        renderList()
      })
    })
  }

  function handleAdd(): void {
    args.clearError()
    const r = args.tryAdd()
    if (!r.ok) {
      args.showError(r.error)
      return
    }
    args.setItems([...args.getItems(), r.item])
    for (const input of args.inputs) input.value = ''
    renderList()
  }

  args.addBtn.addEventListener('click', handleAdd)
  for (const input of args.inputs) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    })
  }

  return { render: renderList }
}
