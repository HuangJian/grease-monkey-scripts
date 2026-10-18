import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/preact'
import { ItemActions } from '../../../src/prism/shared/item-actions'

afterEach(cleanup)

function mount(over: Partial<Parameters<typeof ItemActions>[0]> = {}) {
  const calls: string[] = []
  render(
    <ItemActions
      onBulkRead={() => calls.push('bulk')}
      onHide={() => calls.push('hide')}
      {...over}
    />,
  )
  return { calls }
}

/**
 * The same component inside the row it renders into, which is where it looks for
 * the pointer: 直达 anchors against `.gm-sp-list-item`, not against the span.
 */
function mountInRow(over: Partial<Parameters<typeof ItemActions>[0]> = {}) {
  render(
    <ul class="gm-sp-list">
      <li class="gm-sp-list-item">
        <ItemActions onBulkRead={() => {}} onHide={() => {}} {...over} />
      </li>
    </ul>,
  )
  const row = document.querySelector<HTMLElement>('.gm-sp-list-item')!
  // happy-dom lays nothing out, so its boxes are zero-sized — and every anchor
  // would clamp to 0. Give the row and the action column real ones: the column
  // starts 280px into the row, which is where ↑已读 begins.
  row.getBoundingClientRect = () => ({ left: 100, width: 400 }) as unknown as DOMRect
  const column = row.querySelector<HTMLElement>('.gm-sp-item-actions')!
  column.getBoundingClientRect = () => ({ left: 380, width: 90 }) as unknown as DOMRect
  return {
    row,
    column,
    chip: document.querySelector<HTMLAnchorElement>('[data-action="open-direct"]')!,
  }
}

/** Preact defers re-renders to a microtask, so a state change needs a tick. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const enter = (row: HTMLElement, clientX: number) =>
  row.dispatchEvent(new MouseEvent('mouseenter', { clientX }))

describe('ItemActions', () => {
  test('offers bulk-read and hide, and nothing that opens the entry', () => {
    // Sources whose rows carry no summary have nothing to skip: 直达 would open
    // a page the reader has not decided to read yet.
    const { calls } = mount()
    const actions = document.querySelector('.gm-sp-item-actions')!
    expect(Array.from(actions.children).map((el) => el.textContent)).toEqual(['↑已读', '×隐藏'])
    expect(actions.querySelector('[data-action="open-direct"]')).toBeNull()

    ;(actions.querySelector('.gm-sp-item-bulk-btn') as HTMLElement).click()
    ;(actions.querySelector('.gm-sp-item-hide') as HTMLElement).click()
    expect(calls).toEqual(['bulk', 'hide'])
  })

  test('直达 is offered first so it cannot be confused with ×隐藏', () => {
    mount({ openHref: 'https://example.com/x' })
    const actions = document.querySelector('.gm-sp-item-actions')!
    expect(actions.firstElementChild?.getAttribute('data-action')).toBe('open-direct')
  })

  test('following 直达 reports it, so the caller can mark the entry read', () => {
    const { calls } = mount({ openHref: 'https://example.com/x', onOpen: () => calls.push('open') })
    ;(document.querySelector('[data-action="open-direct"]') as HTMLElement).click()
    expect(calls).toEqual(['open'])
  })

  test('a non-absolute href is dropped, like every other link out of a card', () => {
    // `escapeUrl` is the guard the card uses for feed-supplied URLs: anything
    // that is not http(s) renders as an empty href instead of becoming a
    // `javascript:` link the reader could be talked into clicking.
    mount({ openHref: 'javascript:alert(1)' })
    const link = document.querySelector<HTMLAnchorElement>('[data-action="open-direct"]')!
    expect(link.getAttribute('href')).toBe('')
    expect(link.textContent).toBe('直达')
  })

  test('直达 meets the pointer: anchored 12px to its right when the row is entered', async () => {
    const { row, chip } = mountInRow({
      openHref: 'https://example.com/x',
      openAtPointer: true,
    })
    // Before the row has been pointed at it belongs to the action column: no
    // inline offset, so CSS keeps it in flow next to its neighbours.
    expect(chip.style.left).toBe('')

    enter(row, 160)
    await settle()
    expect(chip.style.left).toBe('72px') // 160 - 100 (row left) + 12
  })

  test('直达 stays where it landed: moving inside the row does not drag it', async () => {
    // Anchored once per hover, not on every move: a chip that follows the
    // cursor slides out from under the click that was already on its way.
    const { row, chip } = mountInRow({
      openHref: 'https://example.com/x',
      openAtPointer: true,
    })
    enter(row, 160)
    await settle()

    row.dispatchEvent(new MouseEvent('mousemove', { clientX: 380 }))
    await settle()
    expect(chip.style.left).toBe('72px')

    // A fresh hover is a new decision about where to reach, so it re-anchors.
    enter(row, 300)
    await settle()
    expect(chip.style.left).toBe('212px')
  })

  test('直达 stops short of ↑已读, however far right the pointer enters', async () => {
    // It may float over the headline, never over the two buttons that stay in
    // the column: ×隐藏 is the one action here that cannot be undone.
    const { row, column, chip } = mountInRow({
      openHref: 'https://example.com/x',
      openAtPointer: true,
    })
    const columnLeft = column.getBoundingClientRect().left - row.getBoundingClientRect().left

    enter(row, 495)
    await settle()
    const left = Number.parseInt(chip.style.left, 10)
    expect(left).toBe(274) // clamped to the column minus the clearance
    expect(left + chip.offsetWidth).toBeLessThanOrEqual(columnLeft - 6)
  })

  test('without the opt-in 直达 keeps its place in the action column', async () => {
    const { row, chip } = mountInRow({ openHref: 'https://example.com/x' })
    enter(row, 160)
    await settle()
    expect(chip.style.left).toBe('')
  })
})
