import type { ComponentChildren } from 'preact'

export type ItemActionsProps = {
  onBulkRead: () => void
  onHide: () => void
}

/**
 * Per-item action buttons (bulk-read-to-top, hide). Sunk from
 * `card/primitives` so source components don't depend on the card layer
 * (§4.4 / R1 — reverse-dependency cleanup). Pure presentational: only the
 * two callbacks cross the boundary.
 */
export function ItemActions({ onBulkRead, onHide }: ItemActionsProps): ComponentChildren {
  return (
    <span class="gm-sp-item-actions">
      <button
        type="button"
        class="gm-sp-item-bulk-btn"
        title="将顶端至此主题全部标记已读"
        onClick={onBulkRead}
      >
        {'↑'}已读
      </button>
      <button type="button" class="gm-sp-item-hide" title="隐藏该主题" onClick={onHide}>
        {'×'}隐藏
      </button>
    </span>
  )
}
