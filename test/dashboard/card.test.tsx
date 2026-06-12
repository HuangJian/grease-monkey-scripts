import { describe, expect, test, afterEach } from 'bun:test'
import { render, screen, within, cleanup } from '@testing-library/preact'
import { Card } from '../../src/dashboard/card/card'

afterEach(cleanup)

describe('Card', () => {
  test('renders header slot when header is provided', () => {
    render(<Card header={<span>Header Content</span>} />)
    screen.getByText('Header Content')
  })

  test('omits header when header is not provided', () => {
    const { container } = render(<Card />)
    expect(within(container as HTMLElement).queryByText('Header Content')).toBeNull()
  })

  test('renders body slot with children', () => {
    render(
      <Card>
        <div class="test-body">body content</div>
      </Card>,
    )
    screen.getByText('body content')
  })

  test('shows error block only when error is non-empty', () => {
    const { container } = render(<Card />)
    expect(container.querySelector('.gm-sp-error-box')).toBeNull()
    render(<Card error="boom" />)
    screen.getByText('boom')
  })

  test('replaces children when re-rendering into the same container', () => {
    const { container } = render(<Card />)
    container.innerHTML = '<legacy-tag>stale</legacy-tag>'
    render(
      <Card>
        <span>new content</span>
      </Card>,
    )
    screen.getByText('new content')
  })
})
