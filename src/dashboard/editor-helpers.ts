import type { Runtime } from '../runtime'
import { CONFIG_KEY } from './types'
import type { ConfigValidation } from './config'
import type { SourceSettings } from './types'

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
  draggable?: boolean
  dragHandleSelector?: string
  chipSelector?: string
  draggingClass?: string
}

export type ChipListHandle = {
  render(): void
}

export function bindChipList<T>(args: ChipListArgs<T>): ChipListHandle {
  const draggable = args.draggable ?? false

  function reorder(src: number, target: number): void {
    if (src === target) return
    const items = [...args.getItems()]
    if (src < 0 || src >= items.length) return
    if (target < 0) target = 0
    if (target > items.length) target = items.length
    const moved = items.splice(src, 1)[0]!
    const insertAt = src < target ? target - 1 : target
    items.splice(insertAt, 0, moved)
    args.setItems(items)
    renderList()
  }

  function renderList(): void {
    args.listEl.replaceChildren()
    const items = args.getItems()
    if (items.length === 0) {
      const el = document.createElement('div')
      el.className = args.emptyClass
      el.textContent = args.emptyText
      args.listEl.appendChild(el)
      return
    }
    const tmp = document.createElement('div')
    tmp.innerHTML = items.map((item, i) => args.renderChip(item, i)).join('')
    while (tmp.firstChild) args.listEl.appendChild(tmp.firstChild)
    args.listEl.querySelectorAll<HTMLElement>(args.removeSelector).forEach((el, i) => {
      el.addEventListener('click', () => {
        const next = args.getItems().filter((_, idx) => idx !== i)
        args.setItems(next)
        renderList()
      })
    })
    if (draggable) attachDragListeners(args.listEl.ownerDocument)
  }

  function attachDragListeners(doc: Document): void {
    const chipSelector = args.chipSelector ?? '.gm-sp-re-chip'
    const handleSelector = args.dragHandleSelector
    const draggingClass = args.draggingClass ?? 'gm-sp-re-chip-dragging'
    const dropBefore = 'gm-sp-re-chip-drop-before'
    const dropAfter = 'gm-sp-re-chip-drop-after'

    let srcIdx: number | null = null
    let hoveredIdx: number | null = null
    let hoveredPos: 'before' | 'after' | null = null
    let draggedChip: HTMLElement | null = null

    function clearIndicators(): void {
      args.listEl
        .querySelectorAll<HTMLElement>(chipSelector)
        .forEach((c) => c.classList.remove(dropBefore, dropAfter))
    }

    function findDropTarget(
      clientX: number,
      clientY: number,
    ): { idx: number; pos: 'before' | 'after' } | null {
      const chips = args.listEl.querySelectorAll<HTMLElement>(chipSelector)
      if (chips.length === 0) return null
      const rects = Array.from(chips, (c) => c.getBoundingClientRect())

      for (let i = 0; i < rects.length; i++) {
        const r = rects[i]!
        if (clientY >= r.top && clientY <= r.bottom) {
          return clientY < r.top + r.height / 2
            ? { idx: i, pos: 'before' }
            : { idx: i, pos: 'after' }
        }
      }

      if (clientY < rects[0]!.top) return { idx: 0, pos: 'before' }
      if (clientY > rects[rects.length - 1]!.bottom) {
        return { idx: rects.length, pos: 'after' }
      }

      let prevBottom = rects[0]!.bottom
      for (let i = 1; i < rects.length; i++) {
        const prevTop = rects[i - 1]!.top
        const currTop = rects[i]!.top
        const sameRow = Math.abs(currTop - prevTop) < 5
        if (sameRow) {
          if (clientX >= rects[i - 1]!.right && clientX <= rects[i]!.left) {
            const midX = (rects[i - 1]!.right + rects[i]!.left) / 2
            return clientX < midX ? { idx: i - 1, pos: 'after' } : { idx: i, pos: 'before' }
          }
        } else {
          if (clientY >= prevBottom && clientY <= currTop) {
            const midY = (prevBottom + currTop) / 2
            return clientY < midY ? { idx: i - 1, pos: 'after' } : { idx: i, pos: 'before' }
          }
        }
        if (!sameRow) prevBottom = rects[i]!.bottom
      }
      return { idx: rects.length, pos: 'after' }
    }

    function onPointerMove(e: PointerEvent): void {
      if (srcIdx === null) return
      const target = findDropTarget(e.clientX, e.clientY)
      if (!target) return
      if (target.idx === hoveredIdx && target.pos === hoveredPos) return
      clearIndicators()
      hoveredIdx = target.idx
      hoveredPos = target.pos
      const chips = args.listEl.querySelectorAll<HTMLElement>(chipSelector)
      if (target.pos === 'before' && target.idx < chips.length) {
        chips[target.idx]!.classList.add(dropBefore)
      } else if (target.pos === 'after' && target.idx > 0) {
        chips[target.idx - 1]!.classList.add(dropAfter)
      }
    }

    function onPointerUp(): void {
      if (srcIdx === null) return
      if (draggedChip) draggedChip.classList.remove(draggingClass)
      clearIndicators()
      const target = hoveredIdx !== null ? hoveredIdx : srcIdx
      if (target !== srcIdx) reorder(srcIdx, target)
      srcIdx = null
      hoveredIdx = null
      hoveredPos = null
      draggedChip = null
      doc.removeEventListener('pointermove', onPointerMove)
      doc.removeEventListener('pointerup', onPointerUp)
    }

    const chips = args.listEl.querySelectorAll<HTMLElement>(chipSelector)
    chips.forEach((chip) => {
      const idx = Number(chip.dataset['index'] ?? -1)
      const handle = handleSelector
        ? (chip.querySelector<HTMLElement>(handleSelector) ?? chip)
        : chip
      handle.style.touchAction = 'none'
      handle.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        srcIdx = idx
        draggedChip = chip
        chip.classList.add(draggingClass)
        doc.addEventListener('pointermove', onPointerMove)
        doc.addEventListener('pointerup', onPointerUp)
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

export async function saveSourceSettings(
  runtime: Runtime,
  sourceId: string,
  settings: SourceSettings,
): Promise<void> {
  const existing = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
  const prev = (existing?.sourceSettings as Record<string, SourceSettings> | undefined) ?? {}
  await runtime.setValue(CONFIG_KEY, {
    ...(existing ?? {}),
    sourceSettings: { ...prev, [sourceId]: settings },
  })
}
