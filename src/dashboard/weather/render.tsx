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
  render(null, container)
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
  renderTabs(titleContainer, data, 0)
}

function renderTabs(titleContainer: HTMLElement, data: WeatherData | null, idx: number): void {
  const entries = data?.entries ?? []
  render(null, titleContainer)
  if (entries.length === 0) {
    titleContainer.textContent = '天气'
    return
  }
  render(
    <WeatherTabs
      entries={entries}
      activeIndex={idx}
      onTabChange={(i: number) => {
        if (bodyEl) {
          bodyEl.querySelectorAll<HTMLElement>('.gm-sp-panel').forEach((p, j) => {
            p.classList.toggle('gm-sp-panel-active', j === i)
          })
        }
        if (titleEl) {
          titleEl.querySelectorAll<HTMLElement>('.gm-sp-tab').forEach((t, j) => {
            t.classList.toggle('gm-sp-tab-active', j === i)
            t.setAttribute('aria-selected', String(j === i))
          })
        }
      }}
    />,
    titleContainer,
  )
}
