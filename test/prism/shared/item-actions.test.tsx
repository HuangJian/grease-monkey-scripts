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
})
