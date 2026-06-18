import { describe, expect, test, afterEach } from 'bun:test'
import { render, cleanup, within } from '@testing-library/preact'
import { useLayoutEffect, useRef } from 'preact/hooks'

afterEach(cleanup)
import { TabsCard } from '../../src/dashboard/card/tabs-card'
import type { CardGroup } from '../../src/dashboard/card-group'
import { CACHE_SCHEMA_VERSION, type CachedSource } from '../../src/dashboard/types'
import { createRuntime } from '../runtime'
import type { Source, TabLabel } from '../../src/dashboard/types'

function cached<T>(data: T | null, fetchedAt = 1_000_000, error?: string): CachedSource<T> {
  const out: CachedSource<T> = { schemaVersion: CACHE_SCHEMA_VERSION, fetchedAt }
  if (data !== null) out.data = data
  if (error) out.error = error
  return out
}

function makeSource(opts: {
  id: string
  title: string
  render?: (container: HTMLElement, data: unknown) => void
  getTabLabel?: (data: any) => TabLabel
  createEditor?: () => (container: HTMLElement, ctx: { onRevert: () => void }) => void
}): Source<unknown> {
  const renderFn =
    opts.render ??
    ((container: HTMLElement, data: unknown) => {
      container.textContent = data == null ? 'empty' : 'data'
    })
  return {
    id: opts.id,
    title: opts.title,
    ttlMs: 60_000,
    fetch: () => Promise.resolve(null as never),
    RenderComponent: (props: { data: unknown }) => {
      const ref = useRef<HTMLDivElement>(null)
      useLayoutEffect(() => {
        if (ref.current) renderFn(ref.current, props.data)
      })
      return <div ref={ref} />
    },
    getTabLabel: opts.getTabLabel,
    createEditor: opts.createEditor as Source<unknown>['createEditor'],
  }
}

function browseGroup(tabs: Source<unknown>[]): CardGroup {
  return { id: 'browse', placement: 'main', tabs }
}

function renderOnce(opts: {
  runtime: ReturnType<typeof createRuntime>
  root: ShadowRoot
  group: CardGroup
  caches: Map<string, CachedSource<unknown> | null>
  activeTabId: string
  onTabChange?: (id: string) => void
  onRefresh?: (id: string) => Promise<void>
  onEdit?: (id: string) => void
  now?: number
}) {
  let tabChanges: string[] = []
  let refreshes: string[] = []
  let edits: string[] = []
  const { container } = render(
    <TabsCard
      group={opts.group}
      caches={opts.caches}
      now={opts.now ?? 1_000_000}
      runtime={opts.runtime}
      root={opts.root}
      activeTabId={opts.activeTabId}
      sourceSettings={{}}
      onTabChange={(id: string) => {
        tabChanges.push(id)
        opts.onTabChange?.(id)
      }}
      onRefresh={async (id: string) => {
        refreshes.push(id)
        await opts.onRefresh?.(id)
      }}
      onEdit={(id: string) => {
        edits.push(id)
        opts.onEdit?.(id)
      }}
    />,
  )
  const el = container as unknown as HTMLElement
  el.dataset['source'] = opts.group.id
  return { container: el, tabChanges, refreshes, edits }
}

describe('renderTabsCard', () => {
  test('sets data-source to group id and renders one tab per source', () => {
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { container } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches: new Map(),
      activeTabId: 'v2ex',
    })
    expect(container.dataset['source']).toBe('browse')
    const tabs = within(container).getAllByRole('tab')
    expect(tabs.length).toBe(2)
    expect(within(tabs[0]).getByText('V2EX 热议')).not.toBeNull()
    expect(within(tabs[1]).getByText('网文更新')).not.toBeNull()
  })

  test('marks the active tab and shows only the active panel by default', () => {
    const v2ex = makeSource({
      id: 'v2ex',
      title: 'V2EX 热议',
      render: (c) => {
        c.textContent = 'v2ex-body'
      },
    })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      render: (c) => {
        c.textContent = 'novels-body'
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { container } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches: new Map(),
      activeTabId: 'v2ex',
    })
    expect(
      (within(container).getByRole('tab', { selected: true }) as HTMLElement).dataset['tabId'],
    ).toBe('v2ex')
    const panels = within(container).getAllByRole('tabpanel', { hidden: true })
    expect(panels.length).toBe(2)
    expect(panels[0]!.classList.contains('gm-sp-tab-panel-active')).toBe(true)
    expect(panels[1]!.classList.contains('gm-sp-tab-panel-active')).toBe(false)
  })

  test('clicking a tab fires onTabChange', () => {
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { container, tabChanges } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches: new Map(),
      activeTabId: 'v2ex',
    })
    ;(within(container).getAllByRole('tab')[1] as HTMLButtonElement).click()
    expect(tabChanges).toEqual(['novels'])
  })

  test('shows badge when getTabLabel returns one, hides otherwise', () => {
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      getTabLabel: (data) => {
        const count = data?.books.filter((b: { hasNew: boolean }) => b.hasNew).length ?? 0
        return { label: '网文更新', badge: count > 0 ? count : null }
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', null],
      ['novels', cached({ books: [{ hasNew: true }, { hasNew: false }, { hasNew: true }] })],
    ])
    const { container } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches,
      activeTabId: 'v2ex',
    })
    const novelTab = within(container).getAllByRole('tab')[1]!
    const badge = within(novelTab).getByText('2') as HTMLElement
    expect(badge.hidden).toBe(false)
  })

  test('hides badge when count is zero', () => {
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      getTabLabel: (data) => {
        const count = data?.books.filter((b: { hasNew: boolean }) => b.hasNew).length ?? 0
        return { label: '网文更新', badge: count > 0 ? count : null }
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', null],
      ['novels', cached({ books: [{ hasNew: false }] })],
    ])
    const { container } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches,
      activeTabId: 'v2ex',
    })
    const novelTab = within(container).getAllByRole('tab')[1]!
    expect(within(novelTab).queryByText('2')).toBeNull()
  })

  test('clicking refresh fires onRefresh for the active tab', () => {
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { container, refreshes } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches: new Map(),
      activeTabId: 'novels',
    })
    ;(within(container).getByRole('button') as HTMLButtonElement).click()
    expect(refreshes).toEqual(['novels'])
  })

  test('renders each tab body with its own data', () => {
    const v2ex = makeSource({
      id: 'v2ex',
      title: 'V2EX 热议',
      render: (c, data) => {
        c.textContent = `v:${(data as { n?: number } | null)?.n ?? '-'}`
      },
    })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      render: (c, data) => {
        c.textContent = `n:${(data as { n?: number } | null)?.n ?? '-'}`
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', cached({ n: 1 })],
      ['novels', cached({ n: 2 })],
    ])
    const { container } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches,
      activeTabId: 'v2ex',
    })
    const panels = within(container).getAllByRole('tabpanel', { hidden: true })
    expect(panels[0]!.textContent).toBe('v:1')
    expect(panels[1]!.textContent).toBe('n:2')
  })

  test('shows edit button only when active tab has createEditor', () => {
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      createEditor: () => (c) => {
        c.textContent = 'editor'
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { container } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches: new Map(),
      activeTabId: 'v2ex',
    })
    expect(within(container).queryByRole('button', { name: '⚙' })).toBeNull()
    render(
      <TabsCard
        group={group}
        caches={new Map()}
        now={1_000_000}
        runtime={createRuntime()}
        root={document.createElement('div') as unknown as ShadowRoot}
        activeTabId="novels"
        sourceSettings={{}}
        onTabChange={() => {}}
        onRefresh={async () => {}}
        onEdit={() => {}}
      />,
      { container },
    )
    expect(within(container).getByRole('button', { name: '⚙' })).not.toBeNull()
  })

  test('shows error from the active tab cache', () => {
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    const novels = makeSource({ id: 'novels', title: '网文更新' })
    const group: CardGroup = browseGroup([v2ex, novels])
    const caches = new Map<string, CachedSource<unknown> | null>([
      ['v2ex', null],
      ['novels', cached(null, 1, 'network error')],
    ])
    const { container } = renderOnce({
      runtime: createRuntime(),
      root: document.createElement('div') as unknown as ShadowRoot,
      group,
      caches,
      activeTabId: 'novels',
    })
    expect(within(container).getByText('network error')).not.toBeNull()
  })

  test('clicking edit opens dialog with editor; editor.onRevert fires onEdit', async () => {
    const root = document.createElement('div') as unknown as ShadowRoot
    document.body.appendChild(root as unknown as HTMLElement)
    const v2ex = makeSource({ id: 'v2ex', title: 'V2EX 热议' })
    let captured: { onRevert: () => void } | null = null
    const novels = makeSource({
      id: 'novels',
      title: '网文更新',
      createEditor: () => (c, ctx) => {
        c.textContent = 'editor'
        captured = ctx
        return { render() {}, cancel() {}, save() {} }
      },
    })
    const group: CardGroup = browseGroup([v2ex, novels])
    const { container, edits } = renderOnce({
      runtime: createRuntime(),
      root,
      group,
      caches: new Map(),
      activeTabId: 'novels',
    })
    expect(within(container).queryByText('editor')).toBeNull()
    ;(within(container).getByRole('button', { name: '⚙' }) as HTMLButtonElement).click()
    await new Promise((r) => setTimeout(r, 0))
    expect(within(root as unknown as HTMLElement).getByText('保存')).not.toBeNull()
    expect(within(root as unknown as HTMLElement).getByText('editor')).not.toBeNull()
    expect(edits).toEqual([])
    captured!.onRevert()
    expect(edits).toEqual(['novels'])
  })
})
