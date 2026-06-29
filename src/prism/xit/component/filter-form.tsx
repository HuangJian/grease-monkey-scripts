import { useEffect, useRef } from 'preact/hooks'
import type { NamedFilter } from '../types'

type FilterFormMode =
  | { type: 'save'; name: string; query: string }
  | { type: 'edit'; filter: NamedFilter }

export function FilterForm({
  mode,
  onSave,
  onCancel,
}: {
  mode: FilterFormMode
  onSave: (name: string, query: string) => void
  onCancel: () => void
}) {
  const nameRef = useRef<HTMLInputElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
    if (mode.type === 'edit') {
      nameRef.current?.select()
    }
  }, [])

  function handleConfirm() {
    const n = nameRef.current?.value.trim() ?? ''
    const q = queryRef.current?.value.trim() ?? ''
    if (n && q) onSave(n, q)
  }

  const initialName = mode.type === 'save' ? mode.name : mode.filter.name
  const initialQuery = mode.type === 'save' ? mode.query : mode.filter.query

  return (
    <div class="gm-sp-xit-save-form">
      <input
        ref={nameRef}
        type="text"
        class="gm-sp-input gm-sp-xit-save-name"
        placeholder="Name"
        defaultValue={initialName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
      />
      <input
        ref={queryRef}
        type="text"
        class="gm-sp-input gm-sp-xit-save-query"
        placeholder="Query"
        defaultValue={initialQuery}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleConfirm()
          if (e.key === 'Escape') onCancel()
          e.stopPropagation()
        }}
      />
      <button type="button" class="gm-sp-btn gm-sp-xit-save-confirm" onClick={handleConfirm}>
        Save
      </button>
      <button type="button" class="gm-sp-btn gm-sp-xit-save-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

export type { FilterFormMode }
