import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { createWeatherEditor } from '../../../src/dashboard/weather/editor'
import { CONFIG_KEY } from '../../../src/dashboard/types'
import { createRuntime, type TestRuntime } from '../../runtime'

function makeDom(): JSDOM {
  return new JSDOM('<!doctype html><html><head></head><body></body></html>')
}

async function mount(
  runtime: TestRuntime,
  container: HTMLElement,
  initialCities: { latitude: number; longitude: number; cityLabel: string }[] = [
    { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
  ],
) {
  let revertCalls = 0
  let closeCalls = 0
  const editor = createWeatherEditor({ cities: initialCities, ttlMinutes: 60 })
  const result = await editor(container, {
    runtime,
    onRevert: () => revertCalls++,
    close: () => closeCalls++,
  })
  return {
    revertCalls: () => revertCalls,
    closeCalls: () => closeCalls,
    result,
  }
}

describe('createWeatherEditor', () => {
  let dom: JSDOM
  let runtime: TestRuntime
  let container: HTMLElement

  beforeEach(() => {
    dom = makeDom()
    runtime = createRuntime(dom)
    container = dom.window.document.createElement('div')
    dom.window.document.body.appendChild(container)
  })

  afterEach(() => {
    dom.window.document.body.innerHTML = ''
  })

  test('renders initial cities as list items', async () => {
    await mount(runtime, container, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
      { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
    ])
    const items = container.querySelectorAll('.gm-sp-editor-item')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.gm-sp-editor-item-label')!.textContent).toBe('BJ')
    expect(items[1].querySelector('.gm-sp-editor-item-label')!.textContent).toBe('SH')
  })

  test('adds a new city from the form', async () => {
    await mount(runtime, container)
    const labelInput = container.querySelector('.gm-sp-we-city-label') as HTMLInputElement
    const latInput = container.querySelector('.gm-sp-we-lat') as HTMLInputElement
    const lonInput = container.querySelector('.gm-sp-we-lon') as HTMLInputElement
    labelInput.value = 'SH'
    latInput.value = '31.2'
    lonInput.value = '121.5'
    ;(container.querySelector('[data-action="add"]') as HTMLButtonElement).click()
    const items = container.querySelectorAll('.gm-sp-editor-item')
    expect(items).toHaveLength(2)
    expect(items[1].querySelector('.gm-sp-editor-item-label')!.textContent).toBe('SH')
    expect(labelInput.value).toBe('')
  })

  test('shows an error when add is missing fields', async () => {
    await mount(runtime, container)
    ;(container.querySelector('[data-action="add"]') as HTMLButtonElement).click()
    const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement
    expect(errorEl.hidden).toBe(false)
    expect(errorEl.textContent).toMatch(/城市名/)
  })

  test('removes a city when its × is clicked', async () => {
    await mount(runtime, container, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
      { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
    ])
    const items = container.querySelectorAll('.gm-sp-editor-item')
    ;(items[0].querySelector('.gm-sp-item-remove') as HTMLButtonElement).click()
    const after = container.querySelectorAll('.gm-sp-editor-item')
    expect(after).toHaveLength(1)
    expect(after[0].querySelector('.gm-sp-editor-item-label')!.textContent).toBe('SH')
  })

  test('cancel calls close', async () => {
    const handle = await mount(runtime, container, [{ latitude: 1, longitude: 2, cityLabel: 'A' }])
    handle.result.cancel?.()
    expect(handle.closeCalls()).toBe(1)
  })

  test('save persists the patch', async () => {
    const { result } = await mount(runtime, container, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ' },
      { latitude: 31.2, longitude: 121.5, cityLabel: 'SH' },
    ])
    void result.save?.()
    await new Promise<void>((r) => setTimeout(r, 0))
    const stored = runtime.stores[CONFIG_KEY] as {
      weather: { cities: { cityLabel: string; latitude: number }[]; ttlMinutes: number }
    }
    expect(stored.weather.cities).toHaveLength(2)
    expect(stored.weather.cities[1].cityLabel).toBe('SH')
    expect(stored.weather.ttlMinutes).toBe(60)
  })

  test('save with empty list shows error and does not persist', async () => {
    const { result } = await mount(runtime, container, [])
    void result.save?.()
    await new Promise<void>((r) => setTimeout(r, 0))
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
    const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement
    expect(errorEl.hidden).toBe(false)
  })

  test('shows empty-state hint when no cities are configured', async () => {
    await mount(runtime, container, [])
    expect(container.querySelector('.gm-sp-editor-empty')!.textContent).toBe('尚未添加城市')
  })

  test('Enter in label input adds the city', async () => {
    await mount(runtime, container)
    const labelInput = container.querySelector('.gm-sp-we-city-label') as HTMLInputElement
    const latInput = container.querySelector('.gm-sp-we-lat') as HTMLInputElement
    const lonInput = container.querySelector('.gm-sp-we-lon') as HTMLInputElement
    labelInput.value = 'GZ'
    latInput.value = '23.1'
    lonInput.value = '113.3'
    labelInput.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    expect(container.querySelectorAll('.gm-sp-editor-item')).toHaveLength(2)
  })

  test('adds a CMA station id and shows it in the list', async () => {
    await mount(runtime, container)
    const labelInput = container.querySelector('.gm-sp-we-city-label') as HTMLInputElement
    const latInput = container.querySelector('.gm-sp-we-lat') as HTMLInputElement
    const lonInput = container.querySelector('.gm-sp-we-lon') as HTMLInputElement
    const cmaInput = container.querySelector('.gm-sp-we-cma') as HTMLInputElement
    labelInput.value = 'BJ'
    latInput.value = '39.9'
    lonInput.value = '116.4'
    cmaInput.value = '54511'
    ;(container.querySelector('[data-action="add"]') as HTMLButtonElement).click()
    const items = container.querySelectorAll('.gm-sp-editor-item')
    expect(items[1].querySelector('.gm-sp-editor-item-cma')!.textContent).toBe('CMA 54511')
  })

  test('rejects malformed CMA station id with an error', async () => {
    await mount(runtime, container)
    const labelInput = container.querySelector('.gm-sp-we-city-label') as HTMLInputElement
    const latInput = container.querySelector('.gm-sp-we-lat') as HTMLInputElement
    const lonInput = container.querySelector('.gm-sp-we-lon') as HTMLInputElement
    const cmaInput = container.querySelector('.gm-sp-we-cma') as HTMLInputElement
    labelInput.value = 'BJ'
    latInput.value = '39.9'
    lonInput.value = '116.4'
    cmaInput.value = '5451'
    ;(container.querySelector('[data-action="add"]') as HTMLButtonElement).click()
    const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement
    expect(errorEl.hidden).toBe(false)
    expect(errorEl.textContent).toMatch(/5 位数字/)
  })
})
