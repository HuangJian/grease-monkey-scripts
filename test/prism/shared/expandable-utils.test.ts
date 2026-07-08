import { afterAll, describe, expect, test } from 'bun:test'
import {
  formatTopicTime,
  isElementInScrollContainer,
} from '../../../src/prism/shared/expandable-utils'
import { createHappyDom, closeAllWindows } from '../../runtime'

describe('formatTopicTime', () => {
  test('date-time format produces MM-DD HH:mm', () => {
    const ts = new Date('2024-03-05T14:30:00').getTime()
    expect(formatTopicTime(ts, 'date-time')).toBe('03-05 14:30')
  })

  test('date format produces MM-DD', () => {
    const ts = new Date('2024-03-05T14:30:00').getTime()
    expect(formatTopicTime(ts, 'date')).toBe('03-05')
  })

  test('pads single-digit month/day/hour/minute', () => {
    const ts = new Date('2024-01-02T03:04:00').getTime()
    expect(formatTopicTime(ts, 'date-time')).toBe('01-02 03:04')
  })

  test('handles midnight', () => {
    const ts = new Date('2024-12-31T00:00:00').getTime()
    expect(formatTopicTime(ts, 'date-time')).toBe('12-31 00:00')
  })

  test('date format ignores time component', () => {
    const ts1 = new Date('2024-06-15T08:30:00').getTime()
    const ts2 = new Date('2024-06-15T23:59:00').getTime()
    expect(formatTopicTime(ts1, 'date')).toBe(formatTopicTime(ts2, 'date'))
  })
})

describe('isElementInScrollContainer', () => {
  test('returns true when no scrollable ancestor exists', () => {
    const win = createHappyDom('<!doctype html><html><body></body></html>')
    const el = win.document.createElement('div')
    win.document.body.appendChild(el)
    // body/html don't have overflow:auto, so no scroll container found
    expect(isElementInScrollContainer(el as unknown as HTMLElement)).toBe(true)
  })

  test('returns true when element overlaps scroll container bounds', () => {
    const win = createHappyDom('<!doctype html><html><body></body></html>')
    const doc = win.document

    const container = doc.createElement('div')
    container.style.overflowY = 'auto'
    doc.body.appendChild(container)

    const row = doc.createElement('div')
    container.appendChild(row)

    // Mock getBoundingClientRect: container [0, 200], row [50, 60] → overlap
    const containerEl = container as unknown as HTMLElement
    const rowEl = row as unknown as HTMLElement
    containerEl.getBoundingClientRect = () => ({ top: 0, bottom: 200 }) as DOMRect
    rowEl.getBoundingClientRect = () => ({ top: 50, bottom: 60 }) as DOMRect
    expect(isElementInScrollContainer(rowEl)).toBe(true)
  })

  test('returns false when element is outside scroll container bounds', () => {
    const win = createHappyDom('<!doctype html><html><body></body></html>')
    const doc = win.document

    const container = doc.createElement('div')
    container.style.overflowY = 'auto'
    doc.body.appendChild(container)

    const row = doc.createElement('div')
    container.appendChild(row)

    // Mock getBoundingClientRect: container [0, 200], row [300, 310] → no overlap
    const containerEl = container as unknown as HTMLElement
    const rowEl = row as unknown as HTMLElement
    containerEl.getBoundingClientRect = () => ({ top: 0, bottom: 200 }) as DOMRect
    rowEl.getBoundingClientRect = () => ({ top: 300, bottom: 310 }) as DOMRect
    expect(isElementInScrollContainer(rowEl)).toBe(false)
  })

  afterAll(() => {
    closeAllWindows()
  })
})
