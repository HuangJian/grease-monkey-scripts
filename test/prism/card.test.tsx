import { describe, expect, test, afterEach } from 'bun:test'
import { render, within, cleanup } from '@testing-library/preact'
import { Card } from '../../src/prism/card/card'

afterEach(cleanup)

describe('Card', () => {
  test('renders header slot when header is provided', () => {
    const { container } = render(<Card header={<span>Header Content</span>} />)
    within(container as HTMLElement).getByText('Header Content')
  })

  test('omits header when header is not provided', () => {
    const { container } = render(<Card />)
    expect(within(container as HTMLElement).queryByText('Header Content')).toBeNull()
  })

  test('renders body slot with children', () => {
    const { container } = render(
      <Card>
        <div class="test-body">body content</div>
      </Card>,
    )
    within(container as HTMLElement).getByText('body content')
  })

  test('shows error block only when error is non-empty', () => {
    const { container } = render(<Card />)
    expect(container.querySelector('.gm-sp-error-box')).toBeNull()
    const { container: c2 } = render(<Card error="boom" />)
    within(c2 as HTMLElement).getByText('boom')
  })

  test('replaces children when re-rendering into the same container', () => {
    const { container } = render(<Card />)
    container.innerHTML = '<legacy-tag>stale</legacy-tag>'
    const { container: c2 } = render(
      <Card>
        <span>new content</span>
      </Card>,
    )
    within(c2 as HTMLElement).getByText('new content')
  })
})
