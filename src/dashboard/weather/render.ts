import { htmlToElement } from '../../utils'
import { aqiLevel, formatHourLabel, weatherCodeIcon, windDirectionArrow } from './helpers'
import type { WeatherCityData, WeatherCityEntry, WeatherData, WeatherHourly } from './types'

export function remainingHours(
  hourly: WeatherHourly,
  currentTime: string,
  cmaMode: boolean,
): number[] {
  const out: number[] = []
  const normalizedCurrent = currentTime.replaceAll('/', '-').replace(' ', 'T')
  for (let i = 0; i < hourly.time.length; i++) {
    const t = hourly.time[i]!
    if (t < normalizedCurrent) continue
    if (!cmaMode && t.slice(0, 10) !== normalizedCurrent.slice(0, 10)) break
    out.push(i)
    if (cmaMode && out.length >= 8) break
  }
  console.log(
    '[cma] remainingHours: cmaMode',
    cmaMode,
    'currentTime',
    currentTime,
    '-> normalized',
    normalizedCurrent,
    'times',
    hourly.time,
    'indices',
    out,
  )
  return out
}

function buildCityBlock(document: Document, data: WeatherCityData): HTMLElement {
  const block = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather-city">
      <div class="gm-sp-weather-summary"></div>
      <div class="gm-sp-weather-hourly"></div>
      <div class="gm-sp-weather-daily"></div>
    </div>`,
  )

  const summary = block.querySelector('.gm-sp-weather-summary')!
  if (data.daily.time.length > 0) {
    const min0 = data.daily.temperature_2m_min[0]!
    const max0 = data.daily.temperature_2m_max[0]!
    const rangeEl = htmlToElement<HTMLSpanElement>(
      document,
      `<span class="gm-sp-weather-range"></span>`,
    )
    rangeEl.textContent = `${Math.round(min0)}°~${Math.round(max0)}°`
    summary.appendChild(rangeEl)
  }

  const apparentEl = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-chip"></span>`,
  )
  apparentEl.textContent = `🌡️ ${Math.round(data.current.apparent_temperature)}°`
  summary.appendChild(apparentEl)

  if (typeof data.current.humidity === 'number' && Number.isFinite(data.current.humidity)) {
    const humidityEl = htmlToElement<HTMLSpanElement>(
      document,
      `<span class="gm-sp-weather-chip"></span>`,
    )
    humidityEl.textContent = `💧 ${Math.round(data.current.humidity)}%`
    summary.appendChild(humidityEl)
  }

  const windArrow = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-wind-arrow"></span>`,
  )
  windArrow.textContent = windDirectionArrow(data.current.wind_direction_10m)
  windArrow.style.setProperty(
    '--gm-sp-wind-rot',
    `${Math.round((data.current.wind_direction_10m + 180) % 360)}deg`,
  )
  const windEl = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-chip gm-sp-weather-wind"></span>`,
  )
  windEl.appendChild(windArrow)
  windEl.appendChild(document.createTextNode(` ${data.current.wind_speed_10m.toFixed(1)} km/h`))
  summary.appendChild(windEl)

  const precipMax = data.daily.precipitation_probability_max[0] ?? 0
  const precipEl = htmlToElement<HTMLSpanElement>(
    document,
    `<span class="gm-sp-weather-chip gm-sp-weather-precip"></span>`,
  )
  if (data.daily.weather_code[0] != null) {
    const precipIcon = htmlToElement<HTMLSpanElement>(
      document,
      `<span class="gm-sp-weather-precip-icon"></span>`,
    )
    precipIcon.textContent = weatherCodeIcon(data.daily.weather_code[0]!)
    precipEl.appendChild(precipIcon)
    precipEl.appendChild(document.createTextNode(` ${precipMax}%`))
  } else {
    precipEl.textContent = `降水 ${precipMax}%`
  }
  summary.appendChild(precipEl)

  const aqiEl = htmlToElement<HTMLSpanElement>(document, `<span class="gm-sp-weather-aqi"></span>`)
  const aq = data.current.air_quality
  const level = aqiLevel(aq?.us_aqi ?? null)
  aqiEl.dataset['level'] = level.label
  aqiEl.style.setProperty('--gm-sp-aqi-color', level.color)
  aqiEl.textContent = aq ? `${aq.us_aqi} ${level.label}` : '--'
  summary.appendChild(aqiEl)

  const hourlyEl = block.querySelector('.gm-sp-weather-hourly')!
  hourlyEl.replaceChildren()
  const indices = remainingHours(data.hourly, data.current.time, data.current.source === 'cma')
  if (indices.length === 0) {
    hourlyEl.appendChild(
      htmlToElement<HTMLDivElement>(
        document,
        '<div class="gm-sp-weather-hourly-empty">无小时数据</div>',
      ),
    )
  } else {
    for (const i of indices) {
      const cell = htmlToElement<HTMLDivElement>(
        document,
        `<div class="gm-sp-weather-hour">
          <span class="gm-sp-weather-hour-time"></span>
          <span class="gm-sp-weather-hour-icon"></span>
          <span class="gm-sp-weather-hour-temp"></span>
          <span class="gm-sp-weather-hour-precip"></span>
        </div>`,
      )
      cell.querySelector('.gm-sp-weather-hour-time')!.textContent = formatHourLabel(
        data.hourly.time[i]!,
      )
      cell.querySelector('.gm-sp-weather-hour-icon')!.textContent = weatherCodeIcon(
        data.hourly.weather_code[i]!,
      )
      cell.querySelector('.gm-sp-weather-hour-temp')!.textContent =
        `${Math.round(data.hourly.temperature_2m[i]!)}°`
      cell.querySelector('.gm-sp-weather-hour-precip')!.textContent =
        `${data.hourly.precipitation_probability[i] ?? 0}%`
      hourlyEl.appendChild(cell)
    }
  }

  const dailyEl = block.querySelector('.gm-sp-weather-daily')!
  dailyEl.replaceChildren()
  const dailyCount = Math.min(4, data.daily.time.length)
  for (let j = 1; j < dailyCount; j++) {
    const max = data.daily.temperature_2m_max[j]!
    const min = data.daily.temperature_2m_min[j]!
    const code = data.daily.weather_code[j]!
    const precip = data.daily.precipitation_probability_max[j] ?? 0
    const label = `+${j}`
    const day = htmlToElement<HTMLDivElement>(
      document,
      `<div class="gm-sp-weather-day">
        <span class="gm-sp-weather-day-label"></span>
        <span class="gm-sp-weather-day-icon"></span>
        <span class="gm-sp-weather-day-temp"></span>
        <span class="gm-sp-weather-day-precip"></span>
      </div>`,
    )
    day.querySelector('.gm-sp-weather-day-label')!.textContent = label
    day.querySelector('.gm-sp-weather-day-icon')!.textContent = weatherCodeIcon(code)
    day.querySelector('.gm-sp-weather-day-temp')!.textContent =
      `${Math.round(min)}° / ${Math.round(max)}°`
    day.querySelector('.gm-sp-weather-day-precip')!.textContent = `${precip}%`
    dailyEl.appendChild(day)
  }

  if (data.current.source === 'cma' && data.cmaUrl) {
    const sourceEl = htmlToElement<HTMLSpanElement>(
      document,
      `<a class="gm-sp-weather-source-inline" href="${data.cmaUrl}" target="_blank" rel="noopener noreferrer">气象局</a>`,
    )
    dailyEl.appendChild(sourceEl)
  }

  return block
}

function buildErrorBlock(document: Document, error: string): HTMLElement {
  const block = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather-city gm-sp-weather-city-error">
      <div class="gm-sp-weather-error"></div>
    </div>`,
  )
  block.querySelector('.gm-sp-weather-error')!.textContent = error
  return block
}

function tabLabelFor(entry: WeatherCityEntry): string {
  if (entry.status === 'ok') {
    const icon = weatherCodeIcon(entry.data.current.weather_code)
    const temp = `${Math.round(entry.data.current.temperature_2m)}°C`
    return `${entry.cityLabel} ${icon} ${temp}`
  }
  return `${entry.cityLabel} --`
}

function setActivePanel(panels: HTMLElement, index: number): void {
  const panelEls = panels.querySelectorAll<HTMLElement>('.gm-sp-weather-panel')
  panelEls.forEach((panel, i) => {
    panel.classList.toggle('gm-sp-weather-panel-active', i === index)
  })
}

function activateTab(tabs: HTMLElement, panels: HTMLElement, index: number): void {
  const tabEls = tabs.querySelectorAll<HTMLElement>('.gm-sp-weather-tab')
  tabEls.forEach((tab, i) => {
    tab.classList.toggle('gm-sp-weather-tab-active', i === index)
    tab.setAttribute('aria-selected', i === index ? 'true' : 'false')
  })
  setActivePanel(panels, index)
}

export function renderWeather(container: HTMLElement, data: WeatherData | null): void {
  const document = container.ownerDocument
  container.replaceChildren()
  const wrap = htmlToElement<HTMLDivElement>(document, `<div class="gm-sp-weather"></div>`)
  const entries = data?.entries ?? []
  if (entries.length === 0) {
    const empty = htmlToElement<HTMLDivElement>(
      document,
      '<div class="gm-sp-weather-empty">--</div>',
    )
    wrap.appendChild(empty)
    container.appendChild(wrap)
    return
  }

  const panels = htmlToElement<HTMLDivElement>(document, `<div class="gm-sp-weather-panels"></div>`)

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const panel = htmlToElement<HTMLDivElement>(
      document,
      `<div class="gm-sp-weather-panel" role="tabpanel"></div>`,
    )
    if (entry.status === 'ok') {
      panel.appendChild(buildCityBlock(document, entry.data))
    } else {
      panel.appendChild(buildErrorBlock(document, entry.error))
    }
    panels.appendChild(panel)
  }

  wrap.appendChild(panels)
  container.appendChild(wrap)
  setActivePanel(panels, 0)
}

export function customizeWeatherHeader(
  titleContainer: HTMLElement,
  data: WeatherData | null,
): void {
  const document = titleContainer.ownerDocument
  const entries = data?.entries ?? []
  titleContainer.replaceChildren()
  if (entries.length === 0) {
    titleContainer.textContent = '天气'
    return
  }
  const tabs = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather-tabs" role="tablist"></div>`,
  )
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const tab = htmlToElement<HTMLButtonElement>(
      document,
      `<button type="button" class="gm-sp-weather-tab" role="tab" aria-selected="false"></button>`,
    )
    tab.textContent = tabLabelFor(entry)
    tab.addEventListener('click', () => {
      const cardRoot = tabs.closest('.gm-sp-card')
      const panelsContainer = cardRoot?.querySelector('.gm-sp-weather-panels')
      if (panelsContainer) activateTab(tabs, panelsContainer as HTMLElement, i)
    })
    tabs.appendChild(tab)
  }
  titleContainer.appendChild(tabs)
  const cardRoot = titleContainer.closest('.gm-sp-card')
  const panelsContainer = cardRoot?.querySelector('.gm-sp-weather-panels')
  if (panelsContainer) activateTab(tabs, panelsContainer as HTMLElement, 0)
}
