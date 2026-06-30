import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { cleanup, waitFor, within } from '@testing-library/preact'
import type { WeatherCity } from '../../../src/prism/weather/types'
import { createWeatherEditor } from '../../../src/prism/weather/editor'
import { CONFIG_KEY } from '../../../src/prism/types'
import { createRuntime, type TestRuntime } from '../../runtime'

async function mount(
  runtime: TestRuntime,
  container: HTMLElement,
  initialCities: WeatherCity[] = [
    { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ', cmaStationId: '' },
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
  let runtime: TestRuntime
  let container: HTMLElement

  beforeEach(() => {
    runtime = createRuntime()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
  })

  test('renders initial cities as list items', async () => {
    await mount(runtime, container, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ', cmaStationId: '' },
      { latitude: 31.2, longitude: 121.5, cityLabel: 'SH', cmaStationId: '' },
    ])
    within(container).getByText('BJ')
    within(container).getByText('SH')
  })

  test('adds a new city from the form', async () => {
    await mount(runtime, container)
    const labelInput = within(container).getByPlaceholderText('北京') as HTMLInputElement
    const latInput = within(container).getByPlaceholderText('39.9042') as HTMLInputElement
    const lonInput = within(container).getByPlaceholderText('116.4074') as HTMLInputElement
    labelInput.value = 'SH'
    latInput.value = '31.2'
    lonInput.value = '121.5'
    within(container).getByRole('button', { name: '添加城市' }).click()
    within(container).getByText('SH')
    expect(labelInput.value).toBe('')
  })

  test('shows an error when add is missing fields', async () => {
    await mount(runtime, container)
    within(container).getByRole('button', { name: '添加城市' }).click()
    const errorEl = within(container).getByText('请输入城市名') as HTMLDivElement
    expect(errorEl.hidden).toBe(false)
  })

  test('removes a city when its × is clicked', async () => {
    await mount(runtime, container, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ', cmaStationId: '' },
      { latitude: 31.2, longitude: 121.5, cityLabel: 'SH', cmaStationId: '' },
    ])
    within(container).getAllByRole('button', { name: 'remove' })[0]!.click()
    within(container).getByText('SH')
  })

  test('cancel calls close', async () => {
    const handle = await mount(runtime, container, [
      { latitude: 1, longitude: 2, cityLabel: 'A', cmaStationId: '' },
    ])
    handle.result.cancel?.()
    expect(handle.closeCalls()).toBe(1)
  })

  test('save persists the patch', async () => {
    const { result } = await mount(runtime, container, [
      { latitude: 39.9, longitude: 116.4, cityLabel: 'BJ', cmaStationId: '' },
      { latitude: 31.2, longitude: 121.5, cityLabel: 'SH', cmaStationId: '' },
    ])
    void result.save?.()
    await waitFor(() => {
      const stored = runtime.stores[CONFIG_KEY] as {
        weather: { cities: { cityLabel: string; latitude: number }[]; ttlMinutes: number }
      }
      expect(stored.weather.cities).toHaveLength(2)
      expect(stored.weather.cities[1].cityLabel).toBe('SH')
      expect(stored.weather.ttlMinutes).toBe(60)
    })
  })

  test('save with empty list shows error and does not persist', async () => {
    const { result } = await mount(runtime, container, [])
    void result.save?.()
    await waitFor(() => {
      const errorEl = within(container).getByText('至少保留一个城市') as HTMLDivElement
      expect(errorEl.hidden).toBe(false)
    })
    expect(runtime.stores[CONFIG_KEY]).toBeUndefined()
  })

  test('shows empty-state hint when no cities are configured', async () => {
    await mount(runtime, container, [])
    within(container).getByText('尚未添加城市')
  })

  test('Enter in label input adds the city', async () => {
    await mount(runtime, container)
    const labelInput = within(container).getByPlaceholderText('北京') as HTMLInputElement
    const latInput = within(container).getByPlaceholderText('39.9042') as HTMLInputElement
    const lonInput = within(container).getByPlaceholderText('116.4074') as HTMLInputElement
    labelInput.value = 'GZ'
    latInput.value = '23.1'
    lonInput.value = '113.3'
    labelInput.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    )
    within(container).getByText('GZ')
  })

  test('adds a CMA station id and shows it in the list', async () => {
    await mount(runtime, container)
    const labelInput = within(container).getByPlaceholderText('北京') as HTMLInputElement
    const latInput = within(container).getByPlaceholderText('39.9042') as HTMLInputElement
    const lonInput = within(container).getByPlaceholderText('116.4074') as HTMLInputElement
    const cmaInput = within(container).getByPlaceholderText('54511（可选）') as HTMLInputElement
    labelInput.value = 'BJ'
    latInput.value = '39.9'
    lonInput.value = '116.4'
    cmaInput.value = '54511'
    within(container).getByRole('button', { name: '添加城市' }).click()
    within(container).getByText('CMA 54511')
  })

  test('rejects malformed CMA station id with an error', async () => {
    await mount(runtime, container)
    const labelInput = within(container).getByPlaceholderText('北京') as HTMLInputElement
    const latInput = within(container).getByPlaceholderText('39.9042') as HTMLInputElement
    const lonInput = within(container).getByPlaceholderText('116.4074') as HTMLInputElement
    const cmaInput = within(container).getByPlaceholderText('54511（可选）') as HTMLInputElement
    labelInput.value = 'BJ'
    latInput.value = '39.9'
    lonInput.value = '116.4'
    cmaInput.value = '5451'
    within(container).getByRole('button', { name: '添加城市' }).click()
    const errorEl = within(container).getByText('CMA 站点 ID 必须是 5 位数字') as HTMLDivElement
    expect(errorEl.hidden).toBe(false)
  })
})
