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
  console.debug(
    '[gm-dashboard] weather.remainingHours: cmaMode',
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

function buildCityBlockHtml(data: WeatherCityData): string {
  const rangeText =
    data.daily.time.length > 0
      ? `${Math.round(data.daily.temperature_2m_min[0]!)}&deg;~${Math.round(data.daily.temperature_2m_max[0]!)}&deg;`
      : ''
  const rangeHtml = rangeText ? `<span class="gm-sp-weather-range">${rangeText}</span>` : ''
  const humidityHtml =
    typeof data.current.humidity === 'number' && Number.isFinite(data.current.humidity)
      ? `<span class="gm-sp-weather-chip">💧 ${Math.round(data.current.humidity)}%</span>`
      : ''
  const windDir = data.current.wind_direction_10m
  const windRot = `${Math.round((windDir + 180) % 360)}deg`
  const arrow = windDirectionArrow(windDir)
  const windArrowHtml = `<span class="gm-sp-weather-wind-arrow" style="--gm-sp-wind-rot: ${windRot}">${arrow}</span>`
  const windSpeed = `${data.current.wind_speed_10m.toFixed(1)} km/h`
  const precipMax = data.daily.precipitation_probability_max[0] ?? 0
  const precipContent =
    data.daily.weather_code[0] != null
      ? `<span class="gm-sp-weather-precip-icon">${weatherCodeIcon(data.daily.weather_code[0]!)}</span> ${precipMax}%`
      : `降水 ${precipMax}%`
  const aq = data.current.air_quality
  const level = aqiLevel(aq?.us_aqi ?? null)

  const indices = remainingHours(data.hourly, data.current.time, data.current.source === 'cma')
  const hourlyContent =
    indices.length === 0
      ? '<div class="gm-sp-weather-hourly-empty">无小时数据</div>'
      : indices
          .map(
            (i) =>
              `<div class="gm-sp-weather-hour">
          <span class="gm-sp-weather-hour-time">${formatHourLabel(data.hourly.time[i]!)}</span>
          <span class="gm-sp-weather-hour-icon">${weatherCodeIcon(data.hourly.weather_code[i]!)}</span>
          <span class="gm-sp-weather-hour-temp">${Math.round(data.hourly.temperature_2m[i]!)}°</span>
          <span class="gm-sp-weather-hour-precip">${data.hourly.precipitation_probability[i] ?? 0}%</span>
        </div>`,
          )
          .join('')

  const dailyCount = Math.min(4, data.daily.time.length)
  const dailyContent = Array.from({ length: dailyCount - 1 }, (_, j) => j + 1)
    .map((j) => {
      const max = data.daily.temperature_2m_max[j]!
      const min = data.daily.temperature_2m_min[j]!
      const code = data.daily.weather_code[j]!
      const precip = data.daily.precipitation_probability_max[j] ?? 0
      return `<div class="gm-sp-weather-day">
          <span class="gm-sp-weather-day-label">+${j}</span>
          <span class="gm-sp-weather-day-icon">${weatherCodeIcon(code)}</span>
          <span class="gm-sp-weather-day-temp">${Math.round(min)}° / ${Math.round(max)}°</span>
          <span class="gm-sp-weather-day-precip">${precip}%</span>
        </div>`
    })
    .join('')
  const sourceHtml = data.cmaUrl
    ? data.cmaFailed
      ? `<span class="gm-sp-weather-source-badge">📌</span><a class="gm-sp-weather-source-inline gm-sp-weather-source-failed"
           href="${data.cmaUrl}" target="_blank"
           rel="noopener noreferrer">气象局</a>`
      : `<a class="gm-sp-weather-source-inline"
           href="${data.cmaUrl}" target="_blank"
           rel="noopener noreferrer">气象局</a>`
    : ''

  const aqiText = aq ? `${aq.us_aqi} ${level.label}` : '--'

  return `<div class="gm-sp-weather-city">
      <div class="gm-sp-weather-summary">
        ${rangeHtml}
        <span class="gm-sp-weather-chip">🌡️ ${Math.round(data.current.apparent_temperature)}°</span>${humidityHtml}
        <span class="gm-sp-weather-chip gm-sp-weather-wind">${windArrowHtml} ${windSpeed}</span>
        <span class="gm-sp-weather-chip gm-sp-weather-precip">${precipContent}</span>
        <span class="gm-sp-weather-aqi" data-level="${level.label}" style="--gm-sp-aqi-color: ${level.color}">${aqiText}</span>
      </div>
      <div class="gm-sp-weather-hourly">${hourlyContent}</div>
      <div class="gm-sp-weather-daily">${dailyContent}${sourceHtml}</div>
    </div>`
}

function buildErrorBlockHtml(error: string): string {
  return `<div class="gm-sp-weather-city gm-sp-weather-city-error">
      <div class="gm-sp-weather-error">${error}</div>
    </div>`
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
  const panelEls = panels.querySelectorAll<HTMLElement>('.gm-sp-panel')
  panelEls.forEach((panel, i) => {
    panel.classList.toggle('gm-sp-panel-active', i === index)
  })
}

function activateTab(tabs: HTMLElement, panels: HTMLElement, index: number): void {
  const tabEls = tabs.querySelectorAll<HTMLElement>('.gm-sp-tab')
  tabEls.forEach((tab, i) => {
    tab.classList.toggle('gm-sp-tab-active', i === index)
    tab.setAttribute('aria-selected', i === index ? 'true' : 'false')
  })
  setActivePanel(panels, index)
}

export function renderWeather(container: HTMLElement, data: WeatherData | null): void {
  container.replaceChildren()
  const entries = data?.entries ?? []
  if (entries.length === 0) {
    container.insertAdjacentHTML(
      'beforeend',
      '<div class="gm-sp-weather"><div class="gm-sp-weather-empty">--</div></div>',
    )
    return
  }

  const panelsHtml = entries
    .map((entry) => {
      const content =
        entry.status === 'ok' ? buildCityBlockHtml(entry.data) : buildErrorBlockHtml(entry.error)
      return `<div class="gm-sp-panel" role="tabpanel">${content}</div>`
    })
    .join('')
  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-weather"><div class="gm-sp-panels">${panelsHtml}</div></div>`,
  )
  const panels = container.querySelector('.gm-sp-panels')! as HTMLElement
  setActivePanel(panels, 0)
}

export function customizeWeatherHeader(
  titleContainer: HTMLElement,
  data: WeatherData | null,
): void {
  const entries = data?.entries ?? []
  titleContainer.replaceChildren()
  if (entries.length === 0) {
    titleContainer.textContent = '天气'
    return
  }
  const tabsHtml = entries
    .map((entry) => {
      const label = tabLabelFor(entry)
      return `<button type="button" class="gm-sp-tab" role="tab" aria-selected="false">${label}</button>`
    })
    .join('')
  titleContainer.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-tabs" role="tablist">${tabsHtml}</div>`,
  )
  const tabs = titleContainer.querySelector('.gm-sp-tabs')! as HTMLElement
  tabs.querySelectorAll<HTMLElement>('.gm-sp-tab').forEach((tab, i) => {
    tab.addEventListener('click', () => {
      const cardRoot = tabs.closest('.gm-sp-card')
      const panelsContainer = cardRoot?.querySelector('.gm-sp-panels')
      if (panelsContainer) activateTab(tabs, panelsContainer as HTMLElement, i)
    })
  })
  const cardRoot = titleContainer.closest('.gm-sp-card')
  const panelsContainer = cardRoot?.querySelector('.gm-sp-panels')
  if (panelsContainer) activateTab(tabs, panelsContainer as HTMLElement, 0)
}
