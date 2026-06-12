import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { bindChipList, readNumberFields } from '../../src/dashboard/editor-helpers'

let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
})

afterEach(() => {
  root.replaceChildren()
  root.remove()
})

describe('readNumberFields', () => {
  function inputWith(value: string): HTMLInputElement {
    const el = document.createElement('input')
    el.value = value
    return el
  }

  test('returns parsed values when all fields valid', () => {
    const errors: string[] = []
    const values = readNumberFields(
      [
        { input: inputWith('5'), min: 1, errorMessage: 'a' },
        { input: inputWith('0.5'), min: 0, max: 1, errorMessage: 'b' },
        { input: inputWith('7'), min: 0, integer: true, errorMessage: 'c' },
      ],
      (m) => errors.push(m),
    )
    expect(errors).toEqual([])
    expect(values).toEqual([5, 0.5, 7])
  })

  test('reports first error and returns null', () => {
    const errors: string[] = []
    const values = readNumberFields(
      [
        { input: inputWith('5'), min: 1, errorMessage: 'first' },
        { input: inputWith('not-a-number'), min: 0, errorMessage: 'second' },
        { input: inputWith('99'), min: 0, max: 50, errorMessage: 'third' },
      ],
      (m) => errors.push(m),
    )
    expect(values).toBeNull()
    expect(errors).toEqual(['second'])
  })

  test('respects integer rule', () => {
    const errors: string[] = []
    const values = readNumberFields(
      [{ input: inputWith('3.5'), min: 0, integer: true, errorMessage: 'int' }],
      (m) => errors.push(m),
    )
    expect(values).toBeNull()
    expect(errors).toEqual(['int'])
  })

  test('rejects non-finite numbers', () => {
    const errors: string[] = []
    const values = readNumberFields(
      [{ input: inputWith('NaN'), min: 0, errorMessage: 'finite' }],
      (m) => errors.push(m),
    )
    expect(values).toBeNull()
    expect(errors).toEqual(['finite'])
  })

  test('returns empty array for empty field list', () => {
    const errors: string[] = []
    expect(readNumberFields([], (m) => errors.push(m))).toEqual([])
    expect(errors).toEqual([])
  })
})

describe('bindChipList', () => {
  type Item = { name: string }

  function buildScaffold(): {
    listEl: HTMLElement
    addBtn: HTMLButtonElement
    input: HTMLInputElement
  } {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="list"></div>
       <input class="chip-input" type="text" />
       <button type="button" class="chip-add">+</button>`,
    )
    return {
      listEl: root.querySelector('.list') as HTMLElement,
      addBtn: root.querySelector('.chip-add') as HTMLButtonElement,
      input: root.querySelector('.chip-input') as HTMLInputElement,
    }
  }

  test('renders empty placeholder when no items', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const items: Item[] = []
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => items,
      setItems: (next) => {
        items.length = 0
        items.push(...next)
      },
      renderChip: (item) =>
        `<div class="chip"><span>${item.name}</span><button class="chip-rm" type="button">×</button></div>`,
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: true, item: { name: input.value.trim() } }),
      showError: () => {},
      clearError: () => {},
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    expect(listEl.querySelector('.empty-row')!.textContent).toBe('empty')
  })

  test('renders existing items via renderChip', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const items: Item[] = [{ name: 'a' }, { name: 'b' }]
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => items,
      setItems: () => {},
      renderChip: (item) =>
        `<div class="chip"><span>${item.name}</span><button class="chip-rm" type="button">×</button></div>`,
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: true, item: { name: 'x' } }),
      showError: () => {},
      clearError: () => {},
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    expect(listEl.querySelectorAll('.chip').length).toBe(2)
    expect(listEl.querySelectorAll('.chip span')[0]!.textContent).toBe('a')
  })

  test('click on add button appends item, clears inputs, re-renders', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const items: Item[] = []
    let lastError: string | null = null
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => items,
      setItems: (next) => {
        items.length = 0
        items.push(...next)
      },
      renderChip: (item) =>
        `<div class="chip"><span>${item.name}</span><button class="chip-rm" type="button">×</button></div>`,
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: true, item: { name: input.value.trim() } }),
      showError: (m) => {
        lastError = m
      },
      clearError: () => {
        lastError = null
      },
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    input.value = 'first'
    addBtn.click()
    expect(items).toEqual([{ name: 'first' }])
    expect(input.value).toBe('')
    expect(lastError).toBeNull()
    expect(listEl.querySelectorAll('.chip').length).toBe(1)
  })

  test('tryAdd failure shows error and does not modify items', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const items: Item[] = [{ name: 'preexisting' }]
    const errors: string[] = []
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => items,
      setItems: () => {
        throw new Error('setItems should not be called on failure')
      },
      renderChip: (item) =>
        `<div class="chip"><span>${item.name}</span><button class="chip-rm" type="button">×</button></div>`,
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: false, error: 'bad input' }),
      showError: (m) => errors.push(m),
      clearError: () => {},
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    addBtn.click()
    expect(errors).toEqual(['bad input'])
    expect(items).toEqual([{ name: 'preexisting' }])
  })

  test('Enter on input triggers tryAdd', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const items: Item[] = []
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => items,
      setItems: (next) => {
        items.length = 0
        items.push(...next)
      },
      renderChip: (item) =>
        `<div class="chip"><span>${item.name}</span><button class="chip-rm" type="button">×</button></div>`,
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: true, item: { name: input.value.trim() } }),
      showError: () => {},
      clearError: () => {},
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    input.value = 'via-enter'
    const ev = new input.ownerDocument.defaultView!.KeyboardEvent('keydown', { key: 'Enter' })
    input.dispatchEvent(ev)
    expect(items).toEqual([{ name: 'via-enter' }])
  })

  test('Enter key on input is preventDefaulted', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => [],
      setItems: () => {},
      renderChip: () => '',
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: true, item: { name: '' } }),
      showError: () => {},
      clearError: () => {},
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    const ev = new input.ownerDocument.defaultView!.KeyboardEvent('keydown', {
      key: 'Enter',
      cancelable: true,
    })
    input.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })

  test('non-Enter keydown is ignored', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const items: Item[] = []
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => items,
      setItems: (next) => {
        items.length = 0
        items.push(...next)
      },
      renderChip: () => '',
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: true, item: { name: 'x' } }),
      showError: () => {},
      clearError: () => {},
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    input.value = 'a'
    const ev = new input.ownerDocument.defaultView!.KeyboardEvent('keydown', { key: 'a' })
    input.dispatchEvent(ev)
    expect(items).toEqual([])
  })

  test('click on remove button drops that index from items and re-renders', () => {
    const { listEl, addBtn, input } = buildScaffold()
    const items: Item[] = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
    const handle = bindChipList<Item>({
      listEl,
      addBtn,
      inputs: [input],
      getItems: () => items,
      setItems: (next) => {
        items.length = 0
        items.push(...next)
      },
      renderChip: (item) =>
        `<div class="chip"><span>${item.name}</span><button class="chip-rm" type="button">×</button></div>`,
      removeSelector: '.chip-rm',
      tryAdd: () => ({ ok: true, item: { name: 'x' } }),
      showError: () => {},
      clearError: () => {},
      emptyText: 'empty',
      emptyClass: 'empty-row',
    })
    handle.render()
    const removeBtns = listEl.querySelectorAll<HTMLButtonElement>('.chip-rm')
    removeBtns[1]!.click()
    expect(items.map((i) => i.name)).toEqual(['a', 'c'])
    expect(listEl.querySelectorAll('.chip').length).toBe(2)
  })
})
