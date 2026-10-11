import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { escapeUrl } from '../../utils'

/**
 * How far to the right of the pointer 直达 appears — far enough that it is
 * clear of the cursor, near enough that reaching it is one short move.
 */
const OPEN_GAP_PX = 12
/** Keeps the chip inside the row when the pointer enters near its right end. */
const OPEN_EDGE_PX = 4

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
  /**
   * Anchor 直达 to where the pointer entered the row instead of leaving it in
   * the action column. Opt-in, and only the RSS reader passes it: its rows are
   * wide, so the walk from the headline the reader is reading to a button pinned
   * at the far end is a long one — and 直达 is the button they reach for most.
   *
   * Anchored **once per hover**: the chip is placed when the pointer enters the
   * row and then stays put, so it cannot slide out from under a cursor that is
   * already on its way to it. ↑已读 and ×隐藏 are unaffected — they stay in the
   * column at the right edge, where a destructive control belongs.
   */
  openAtPointer?: boolean | undefined
  /**
   * Reports whether 已读 is being hovered (or focused), so the source can show
   * which rows it would touch. Optional: only sources that preview it pass this,
   * and without it the button behaves exactly as before.
   */
  onBulkReadPreview?: ((active: boolean) => void) | undefined
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
  onBulkReadPreview,
  openAtPointer,
}: ItemActionsProps): ComponentChildren {
  /**
   * Focus counts as hovering: keyboard users tab through these buttons, and a
   * `title` alone does not tell them how far up the reach goes.
   */
  const preview = (active: boolean) => () => onBulkReadPreview?.(active)
  const previewProps = onBulkReadPreview
    ? {
        onMouseEnter: preview(true),
        onMouseLeave: preview(false),
        onFocus: preview(true),
        onBlur: preview(false),
      }
    : {}

  const actionsRef = useRef<HTMLSpanElement>(null)
  const openRef = useRef<HTMLAnchorElement>(null)
  /**
   * Where 直达 sits, in px from the row's left edge. `null` until the row has
   * been hovered, which leaves the chip at its in-flow position inside the
   * action column — where it belongs for keyboard focus, and where it was
   * before this row was ever pointed at.
   */
  const [openLeft, setOpenLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!openAtPointer) return
    // The row, not this span: the pointer is over the headline when the actions
    // appear, which is nowhere near the column they live in.
    const row = actionsRef.current?.closest<HTMLElement>('.gm-sp-list-item')
    if (!row) return
    const anchor = (event: MouseEvent) => {
      const box = row.getBoundingClientRect()
      const chip = openRef.current
      const room = Math.max(0, box.width - (chip?.offsetWidth ?? 0) - OPEN_EDGE_PX)
      // `mouseenter` alone: a second one means a new hover, which re-anchors,
      // while moving inside the row does not touch it.
      setOpenLeft(Math.min(event.clientX - box.left + OPEN_GAP_PX, room))
    }
    row.addEventListener('mouseenter', anchor)
    return () => row.removeEventListener('mouseenter', anchor)
  }, [openAtPointer])

  return (
    <span class="gm-sp-item-actions" ref={actionsRef}>
      {openHref ? (
        <a
          ref={openRef}
          class={openAtPointer ? 'gm-sp-item-open gm-sp-item-open-pointer' : 'gm-sp-item-open'}
          data-action="open-direct"
          href={escapeUrl(openHref)}
          target="_blank"
          rel="noopener noreferrer"
          title="直接打开原文，不展开摘要"
          onClick={onOpen}
          style={openLeft === null ? undefined : { left: `${openLeft}px` }}
        >
          直达
        </a>
      ) : null}
      <button
        type="button"
        class="gm-sp-item-bulk-btn"
        title="将顶端至此主题全部标记已读"
        onClick={onBulkRead}
        {...previewProps}
      >
        {'↑'}已读
      </button>
      <button type="button" class="gm-sp-item-hide" title="隐藏该主题" onClick={onHide}>
        {'×'}隐藏
      </button>
    </span>
  )
}
