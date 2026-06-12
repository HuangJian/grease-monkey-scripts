import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { render } from 'preact'
import { h } from 'preact'
import { Card } from '../../src/dashboard/card/card'
import type { CardProps } from '../../src/dashboard/card/card'

function setup() {
  const dom = new JSDOM('<html><body><div id="c"></div></body></html>')
  const container = dom.window.document.getElementById('c') as HTMLElement
  return { dom, container }
}

function renderCard(container: HTMLElement, props: Partial<CardProps> = {}) {
  render(h(Card, props as CardProps), container)
}

describe('Card', () => {
  test('renders header slot when header is provided', () => {
    const { container } = setup()
    renderCard(container, { header: h('span', null, 'Header Content') })
    const header = container.querySelector('.gm-sp-card-header')
    expect(header).not.toBeNull()
    expect(header!.textContent).toBe('Header Content')
  })

  test('omits header when header is not provided', () => {
    const { container } = setup()
    renderCard(container)
    expect(container.querySelector('.gm-sp-card-header')).toBeNull()
  })

  test('renders body slot with children', () => {
    const { container } = setup()
    renderCard(container, {
      children: h('div', { class: 'test-body' }, 'body content'),
    })
    const body = container.querySelector('.gm-sp-card-body')
    expect(body).not.toBeNull()
    expect(body!.querySelector('.test-body')!.textContent).toBe('body content')
  })

  test('shows error block only when error is non-empty', () => {
    const { container } = setup()
    renderCard(container)
    expect(container.querySelector('.gm-sp-error-box')).toBeNull()
    renderCard(container, { error: 'boom' })
    const errBlock = container.querySelector('.gm-sp-error-box')
    expect(errBlock).not.toBeNull()
    expect(errBlock!.textContent).toBe('boom')
  })

  test('replaces children when re-rendering into the same container', () => {
    const { container } = setup()
    container.innerHTML = '<legacy-tag>stale</legacy-tag>'
    renderCard(container, {
      children: h('span', null, 'new content'),
    })
    expect(container.querySelector('.gm-sp-card-body')!.textContent).toBe('new content')
  })
})
