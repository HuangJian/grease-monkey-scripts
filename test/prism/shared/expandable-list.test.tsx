import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, render } from '@testing-library/preact'
import { createHappyDom, closeAllWindows } from '../../runtime'
import { ExpandableList, useExpandScroll } from '../../../src/prism/shared/expandable-list'
import type { ExpandScrollApi } from '../../../src/prism/shared/expandable-list'

type TestItem = { id: string; title: string; time: number; body: string }

function makeItem(id: string): TestItem {
  return { id, title: `Title ${id}`, time: 1700000000000, body: `<p>Body ${id}</p>` }
}

// Use unknown to avoid happy-dom vs global HTMLElement type conflicts
let root: unknown

beforeEach(() => {
  const win = createHappyDom('<!doctype html><html><body></body></html>')
  const el = win.document.createElement('div')
  win.document.body.appendChild(el)
  root = el
})

afterEach(() => {
  cleanup()
})

afterAll(() => closeAllWindows())

describe('ExpandableList', () => {
  test('renders empty message when items list is empty', () => {
    render(
      <ExpandableList
        items={[]}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date-time"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    expect(el.querySelector('.gm-sp-empty')?.textContent).toBe('暂无数据')
  })

  test('renders all items with time and title', () => {
    const items = [makeItem('a'), makeItem('b')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    expect(el.querySelectorAll('.gm-sp-expandable-row').length).toBe(2)
    expect(el.querySelector('[data-item-id="a"]')).not.toBeNull()
    expect(el.querySelector('[data-item-id="b"]')).not.toBeNull()
  })

  test('hides items for which isHidden returns true', () => {
    const items = [makeItem('a'), makeItem('b')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        isHidden={(id: string) => id === 'a'}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    expect(el.querySelector('[data-item-id="a"]')).toBeNull()
    expect(el.querySelector('[data-item-id="b"]')).not.toBeNull()
  })

  test('shows body when expanded', () => {
    const items = [makeItem('a')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={(id: string) => id === 'a'}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    const li = el.querySelector('[data-item-id="a"]')
    expect(li?.classList.contains('gm-sp-list-item-expanded')).toBe(true)
    expect(li?.querySelector('.gm-sp-expandable-body')).not.toBeNull()
  })

  test('hides body when not expanded', () => {
    const items = [makeItem('a')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    expect(el.querySelector('.gm-sp-expandable-body')).toBeNull()
  })

  test('calls onRowClick when row is clicked', () => {
    const items = [makeItem('a')]
    const clicked = { id: '' }
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        onRowClick={(it: TestItem) => {
          clicked.id = it.id
        }}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    const row = el.querySelector('.gm-sp-expandable-row') as unknown as HTMLElement
    row.click()
    expect(clicked.id).toBe('a')
  })

  test('renders extra content via renderExtra', () => {
    const items = [makeItem('a')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        renderExtra={(it: TestItem) => <span class="gm-sp-extra">{it.id}-stats</span>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    expect(el.querySelector('.gm-sp-extra')?.textContent).toBe('a-stats')
  })

  test('renders actions via renderActions', () => {
    const items = [makeItem('a')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        renderActions={(it: TestItem) => <button class="gm-sp-test-action">{it.id}</button>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    expect(el.querySelector('.gm-sp-test-action')?.textContent).toBe('a')
  })

  test('applies read class for read items', () => {
    const items = [makeItem('a')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        isRead={(id: string) => id === 'a'}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    expect(el.querySelector('[data-item-id="a"]')?.classList.contains('gm-sp-item-read')).toBe(true)
  })

  test('sets role and tabindex when provided', () => {
    const items = [makeItem('a')]
    render(
      <ExpandableList
        items={items}
        getItemId={(it: TestItem) => it.id}
        isExpanded={() => false}
        onRowClick={() => {}}
        getTime={(it: TestItem) => it.time}
        timeFormat="date"
        renderTitle={(it: TestItem) => <span>{it.title}</span>}
        renderBody={(it: TestItem) => <div>{it.body}</div>}
        containerClassName="gm-sp-test"
        rowRole="button"
        rowTabIndex={0}
      />,
      { container: root as unknown as HTMLElement },
    )
    const el = root as HTMLElement
    const row = el.querySelector('.gm-sp-expandable-row') as unknown as HTMLElement
    expect(row.getAttribute('role')).toBe('button')
    expect(row.getAttribute('tabindex')).toBe('0')
  })
})

describe('useExpandScroll', () => {
  test('scrollIfNeeded does not throw when element not found', () => {
    let result = false
    function TestComp() {
      const { scrollIfNeeded } = useExpandScroll(root as unknown as HTMLElement)
      void scrollIfNeeded('nonexistent')
      result = true
      return <div>test</div>
    }
    render(<TestComp />, { container: root as unknown as HTMLElement })
    expect(result).toBe(true)
  })

  test('useExpandScroll returns api with scrollIfNeeded and scrollTargetRef', () => {
    let api: ExpandScrollApi | null = null
    function TestComp() {
      api = useExpandScroll(root as unknown as HTMLElement)
      return <div>test</div>
    }
    render(<TestComp />, { container: root as unknown as HTMLElement })
    expect(api).not.toBeNull()
    expect(typeof api!.scrollIfNeeded).toBe('function')
    expect(api!.scrollTargetRef).toBeDefined()
  })
})
