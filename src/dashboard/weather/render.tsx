import { render } from 'preact'
import { WeatherPanels, WeatherTabs } from './component'
import type { WeatherData } from './types'

let bodyEl: HTMLElement | null = null
let titleEl: HTMLElement | null = null

export function renderWeather(container: HTMLElement, data: WeatherData | null): void {
  bodyEl = container
  renderPanels(data, 0)
}

function renderPanels(data: WeatherData | null, idx: number): void {
  const container = bodyEl
  if (!container) return
  const entries = data?.entries ?? []
  if (entries.length === 0) {
    render(
      <div class="gm-sp-weather">
        <div class="gm-sp-weather-empty">--</div>
      </div>,
      container,
    )
    return
  }
  render(<WeatherPanels entries={entries} activeIndex={idx} />, container)
}

export function customizeWeatherHeader(
  titleContainer: HTMLElement,
  data: WeatherData | null,
): void {
  titleEl = titleContainer
  renderTabs(data, 0)
}

function renderTabs(data: WeatherData | null, idx: number): void {
  const container = titleEl
  if (!container) return
  const entries = data?.entries ?? []
  if (entries.length === 0) {
    container.textContent = '天气'
    return
  }
  render(
    <WeatherTabs
      entries={entries}
      activeIndex={idx}
      onTabChange={(i: number) => {
        renderPanels(data, i)
        renderTabs(data, i)
      }}
    />,
    container,
  )
}
