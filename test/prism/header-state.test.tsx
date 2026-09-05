import { describe, expect, test, afterEach } from 'bun:test'
import { render, cleanup, getByTestId } from '@testing-library/preact'
import { act } from 'preact/test-utils'
import {
  createHeaderState,
  useHeaderState,
  type HeaderStateStore,
} from '../../src/prism/header-state'

afterEach(cleanup)

type State = { activeIndex: number; label: string }

function Probe({ store }: { store: HeaderStateStore<State> }) {
  const hs = useHeaderState(store)
  return (
    <span>
      <span data-testid="idx">{hs.activeIndex}</span>
      <span data-testid="lbl">{hs.label}</span>
    </span>
  )
}

describe('createHeaderState', () => {
  test('get returns the initial state', () => {
    const s = createHeaderState<State>({ activeIndex: 0, label: 'a' })
    expect(s.get()).toEqual({ activeIndex: 0, label: 'a' })
  })

  test('set applies the updater and notifies subscribers', () => {
    const s = createHeaderState<State>({ activeIndex: 0, label: 'a' })
    let calls = 0
    const unsub = s.subscribe(() => calls++)
    s.set((prev) => ({ ...prev, activeIndex: 1 }))
    expect(s.get().activeIndex).toBe(1)
    expect(calls).toBe(1)
    unsub()
    s.set((prev) => ({ ...prev, activeIndex: 2 }))
    // unsubscribed: no further notifications
    expect(calls).toBe(1)
  })
})

describe('useHeaderState', () => {
  test('re-renders the component when the store changes', () => {
    const s = createHeaderState<State>({ activeIndex: 0, label: 'a' })
    const { container } = render(<Probe store={s} />)
    expect(getByTestId(container as HTMLElement, 'idx').textContent).toBe('0')
    act(() => {
      s.set((prev) => ({ ...prev, activeIndex: 5, label: 'b' }))
    })
    expect(getByTestId(container as HTMLElement, 'idx').textContent).toBe('5')
    expect(getByTestId(container as HTMLElement, 'lbl').textContent).toBe('b')
  })

  test('unsubscribes on unmount so subsequent set is a no-op for the component', () => {
    const s = createHeaderState<State>({ activeIndex: 0, label: 'a' })
    const { unmount, container } = render(<Probe store={s} />)
    expect(getByTestId(container as HTMLElement, 'idx').textContent).toBe('0')
    unmount()
    // After unmount the subscriber must be removed: store updates must not throw
    // and must still mutate state (the component simply no longer re-renders).
    expect(() => act(() => s.set((prev) => ({ ...prev, activeIndex: 9 })))).not.toThrow()
    expect(s.get().activeIndex).toBe(9)
  })
})
