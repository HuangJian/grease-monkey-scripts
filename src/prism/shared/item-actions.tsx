import type { ComponentChildren } from 'preact'
import { escapeUrl } from '../../utils'

export type ItemActionsProps = {
  onBulkRead: () => void
  onHide: () => void
  /**
   * 「直达」 — opens the original without expanding the row first.
   *
   * Optional, and currently only the RSS reader passes it: its rows carry a
   * summary, so following an entry cost two clicks (expand, then 打开原文) even
   * when the headline already said it was worth opening.
   *
   * An `<a>` rather than a button, so middle-click, "open in new tab" and the
   * status-bar preview keep working — the same reason 打开原文 is one.
   */
  openHref?: string | undefined
  /** Called when it is followed; the reader marks the entry read. */
  onOpen?: (() => void) | undefined
}

/**
 * Per-item action buttons (直达, bulk-read-to-top, hide). Sunk from
 * `card/primitives` so source components don't depend on the card layer
 * (§4.4 / R1 — reverse-dependency cleanup). Pure presentational: only the
 * callbacks cross the boundary.
 *
 * 直达 leads. It is the action the reader reaches for most, and first position
 * also keeps it away from ×隐藏, the one here that cannot be undone.
 */
export function ItemActions({
  onBulkRead,
  onHide,
  openHref,
  onOpen,
}: ItemActionsProps): ComponentChildren {
  return (
    <span class="gm-sp-item-actions">
      {openHref ? (
        <a
          class="gm-sp-item-open"
          data-action="open-direct"
          href={escapeUrl(openHref)}
          target="_blank"
          rel="noopener noreferrer"
          title="直接打开原文，不展开摘要"
          onClick={onOpen}
        >
          直达
        </a>
      ) : null}
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
