import { describe, expect, test, afterEach } from 'bun:test'
import { render, within, cleanup } from '@testing-library/preact'
import { Card } from '../../src/dashboard/card/card'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'

afterEach(cleanup)

function cached<T>(partial: Omit<CachedSource<T>, 'schemaVersion' | 'byteSize'>): CachedSource<T> {
  return { schemaVersion: CACHE_SCHEMA_VERSION, byteSize: 0, ...partial }
}

function renderWithChrome({
  title = 'Test',
  cached: cachedData = null as CachedSource<unknown> | null,
  now = 1_000_000,
  ttlMs = 60_000,
} = {}) {
  const timeAgo = cachedData ? `${Math.round((now - cachedData.fetchedAt) / 1000)}秒前` : ''
  const isStale = cachedData != null && now - cachedData.fetchedAt > ttlMs * 3

  return render(
    <Card
      header={
        <>
          <span class="gm-sp-card-title-text">{title}</span>
          {cachedData && <span class="gm-sp-card-time">{timeAgo}</span>}
          {isStale && <span class="gm-sp-card-stale">数据陈旧</span>}
          <button type="button" class="gm-sp-refresh">
            ↻
          </button>
          <button type="button" class="gm-sp-edit" data-action="edit">
            ⚙
          </button>
        </>
      }
    >
      <div>body</div>
    </Card>,
  )
}

describe('Card chrome integration', () => {
  test('renders header, body, and refresh button', () => {
    const { container } = renderWithChrome()
    expect(within(container as HTMLElement).getByText('Test')).not.toBeNull()
    expect(within(container as HTMLElement).getByText('body')).not.toBeNull()
    expect(within(container as HTMLElement).getByRole('button', { name: '↻' })).not.toBeNull()
  })

  test('omits stale badge when cache is fresh', () => {
    const { container } = renderWithChrome({
      cached: cached({ fetchedAt: 999_000 }),
    })
    expect(within(container as HTMLElement).queryByText('数据陈旧')).toBeNull()
  })

  test('shows stale badge when cache is very old', () => {
    const { container } = renderWithChrome({
      now: 1_000_000,
      ttlMs: 60_000,
      cached: cached({ fetchedAt: 1_000_000 - 60 * 60_000 * 4 }),
    })
    expect(within(container as HTMLElement).getByText('数据陈旧')).not.toBeNull()
  })

  test('shows error block only when cached.error is set', () => {
    const { container: c1 } = render(
      <Card error="">
        <div>body</div>
      </Card>,
    )
    expect(c1.querySelector('.gm-sp-error-box')).toBeNull()
    const { container: c2 } = render(
      <Card error="boom">
        <div>body</div>
      </Card>,
    )
    expect(within(c2 as HTMLElement).getByText('boom')).not.toBeNull()
  })

  test('renders title text content', () => {
    const { container } = renderWithChrome({ title: 'My Title' })
    expect(within(container as HTMLElement).getByText('My Title')).not.toBeNull()
  })
})
