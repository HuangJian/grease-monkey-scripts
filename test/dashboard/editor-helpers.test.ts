import { describe, expect, test } from 'bun:test'
import { readNumberFields } from '../../src/dashboard/editor-helpers'

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
