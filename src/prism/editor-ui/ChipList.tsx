import { useCallback, useRef } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { escapeHtml } from '../../utils'

export type ChipListProps = {
  sectionLabel: string
  items: string[]
  emptyMessage: string
  onRemove: (index: number) => void
  onMoveUp?: (index: number) => void
  onMoveDown?: (index: number) => void
  onAdd: (raw: string) => string | null
  onError: (msg: string) => void
  renderLabel?: (item: string) => ComponentChildren
  addInputPlaceholder?: string
  addButtonLabel?: string
  addButtonDataAction?: string
  listClassName?: string
  chipLabelClass?: string
}

export function ChipList({
  sectionLabel,
  items,
  emptyMessage,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAdd,
  onError,
  renderLabel,
  addInputPlaceholder = '',
  addButtonLabel = '添加',
  addButtonDataAction = 'add',
  listClassName = 'gm-sp-re-list',
  chipLabelClass,
}: ChipListProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdd = useCallback(() => {
    const val = inputRef.current?.value ?? ''
    const err = onAdd(val)
    if (err) {
      onError(err)
    } else if (inputRef.current) {
      inputRef.current.value = ''
    }
  }, [onAdd, onError])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd],
  )

  return (
    <div class="gm-sp-editor-section">
      <div class="gm-sp-editor-label">{sectionLabel}</div>
      <div class={listClassName}>
        {items.length === 0 ? (
          <div class="gm-sp-editor-empty">{emptyMessage}</div>
        ) : (
          items.map((name, i) => (
            <div class="gm-sp-editor-chip" key={i}>
              {onMoveUp && onMoveDown && (
                <>
                  <button
                    type="button"
                    class="gm-sp-editor-chip-move"
                    aria-label="move up"
                    disabled={i === 0}
                    onClick={() => onMoveUp(i)}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    class="gm-sp-editor-chip-move"
                    aria-label="move down"
                    disabled={i === items.length - 1}
                    onClick={() => onMoveDown(i)}
                  >
                    ▼
                  </button>
                </>
              )}
              <span class={`gm-sp-editor-chip-label${chipLabelClass ? ` ${chipLabelClass}` : ''}`}>
                {renderLabel ? renderLabel(name) : escapeHtml(name)}
              </span>
              <button
                type="button"
                class="gm-sp-editor-chip-remove"
                aria-label="remove"
                onClick={() => onRemove(i)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div class="gm-sp-editor-add-row">
        <input
          ref={inputRef}
          type="text"
          class="gm-sp-input gm-sp-editor-input"
          placeholder={addInputPlaceholder}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          class="gm-sp-btn gm-sp-editor-btn"
          data-action={addButtonDataAction}
          onClick={handleAdd}
        >
          {addButtonLabel}
        </button>
      </div>
    </div>
  )
}
