import type { SourceComponentProps } from '../types'
import { aqiLevel, formatHourLabel, weatherCodeIcon, windDirectionArrow } from './helpers'
import type { WeatherCityData, WeatherCityEntry, WeatherData, WeatherHourly } from './types'

export function remainingHours(
  hourly: WeatherHourly,
  currentTime: string,
  cmaMode: boolean,
): number[] {
  const out: number[] = []
  const normalizedCurrent = currentTime.replaceAll('/', '-').replace(' ', 'T')
  hourly.time.some((t, i) => {
    if (t < normalizedCurrent) return false
    if (!cmaMode && t.slice(0, 10) !== normalizedCurrent.slice(0, 10)) return true
    out.push(i)
    if (cmaMode && out.length >= 8) return true
    return false
  })
  // CMA hourly table only has 8 slots; by late afternoon they can all be in
  // the past.  Fall back to the latest available slots so the UI never shows
  // an empty hourly strip when data was successfully fetched.
  if (cmaMode && out.length === 0) {
    const count = Math.min(8, hourly.time.length)
    for (let i = hourly.time.length - count; i < hourly.time.length; i++) {
      out.push(i)
    }
  }
  return out
}

function tabLabelFor(entry: WeatherCityEntry): string {
  if (entry.status === 'ok') {
    const icon = weatherCodeIcon(entry.data.current.weather_code)
    const temp = `${Math.round(entry.data.current.temperature_2m)}°C`
    return `${entry.cityLabel} ${icon} ${temp}`
  }
  return `${entry.cityLabel} --`
}

export type WeatherComponentProps = SourceComponentProps<WeatherData> & {
  activeIndex?: number
}

export function WeatherComponent({ data, activeIndex = 0 }: WeatherComponentProps) {
  console.debug('[gm-weather-body] render, activeIndex:', activeIndex)
  const entries = data?.entries ?? []

  if (entries.length === 0) {
    return (
      <div class="gm-sp-weather">
        <div class="gm-sp-weather-empty">--</div>
      </div>
    )
  }

  const safeIndex = Math.min(activeIndex, entries.length - 1)

  return (
    <div class="gm-sp-weather">
      <WeatherPanels entries={entries} activeIndex={safeIndex} />
    </div>
  )
}

export function WeatherHeader({
  data,
  activeIndex = 0,
  onTabChange,
}: {
  data?: WeatherData | null
  activeIndex?: number
  onTabChange?: (index: number) => void
}) {
  const entries = data?.entries ?? []
  if (entries.length === 0) return null
  const safeIndex = Math.min(activeIndex, entries.length - 1)
  return <WeatherTabs entries={entries} activeIndex={safeIndex} onTabChange={onTabChange} />
}

export function WeatherTabs({
  entries,
  activeIndex,
  onTabChange = () => {},
}: {
  entries: WeatherCityEntry[]
  activeIndex: number
  onTabChange?: (index: number) => void
}) {
  if (entries.length === 0) return null
  return (
    <div class="gm-sp-tabs" role="tablist">
      {entries.map((entry, i) => (
        <button
          type="button"
          class={`gm-sp-tab${i === activeIndex ? ' gm-sp-tab-active' : ''}`}
          role="tab"
          aria-selected={i === activeIndex}
          onClick={() => onTabChange(i)}
        >
          {tabLabelFor(entry)}
        </button>
      ))}
    </div>
  )
}

export function WeatherPanels({
  entries,
  activeIndex,
}: {
  entries: WeatherCityEntry[]
  activeIndex: number
}) {
  return (
    <div class="gm-sp-panels">
      {entries.map((entry, i) => (
        <div class={`gm-sp-panel${i === activeIndex ? ' gm-sp-panel-active' : ''}`} role="tabpanel">
          {entry.status === 'ok' ? (
            <CityBlock data={entry.data} />
          ) : (
            <WeatherErrorBlock error={entry.error} />
          )}
        </div>
      ))}
    </div>
  )
}

function CityBlock({ data }: { data: WeatherCityData }) {
  const rangeText =
    data.daily.time.length > 0
      ? `${Math.round(data.daily.temperature_2m_min[0]!)}°~${Math.round(data.daily.temperature_2m_max[0]!)}°`
      : ''
  const humidity =
    typeof data.current.humidity === 'number' && Number.isFinite(data.current.humidity)
      ? `💧 ${Math.round(data.current.humidity)}%`
      : null
  const windDir = data.current.wind_direction_10m
  const windRot = `${Math.round((windDir + 180) % 360)}deg`
  const arrow = windDirectionArrow(windDir)
  const windSpeed = `${data.current.wind_speed_10m.toFixed(1)} km/h`
  const precipMax = data.daily.precipitation_probability_max[0] ?? 0
  const aq = data.current.air_quality
  const level = aqiLevel(aq?.us_aqi ?? null)

  const indices = remainingHours(data.hourly, data.current.time, data.current.source === 'cma')
  const dailyCount = Math.min(4, data.daily.time.length)

  const sourceEl =
    data.cmaUrl && !data.cmaFailed ? (
      <a
        class="gm-sp-weather-source-inline"
        href={data.cmaUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        气象局
      </a>
    ) : data.cmaUrl ? (
      <>
        <span class="gm-sp-weather-source-badge">📌</span>
        <a
          class="gm-sp-weather-source-inline gm-sp-weather-source-failed"
          href={data.cmaUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          气象局
        </a>
      </>
    ) : null

  return (
    <div>
      <div class="gm-sp-weather-summary">
        {rangeText && <span class="gm-sp-weather-range">{rangeText}</span>}
        <span class="gm-sp-weather-chip">🌡️ {Math.round(data.current.apparent_temperature)}°</span>
        {humidity && <span class="gm-sp-weather-chip">{humidity}</span>}
        <span class="gm-sp-weather-chip gm-sp-weather-wind">
          <span class="gm-sp-weather-wind-arrow" style={`--gm-sp-wind-rot: ${windRot}`}>
            {arrow}
          </span>{' '}
          {windSpeed}
        </span>
        <span class="gm-sp-weather-chip gm-sp-weather-precip">
          <span class="gm-sp-weather-precip-icon">
            {data.daily.weather_code[0] != null ? weatherCodeIcon(data.daily.weather_code[0]!) : ''}
          </span>{' '}
          {precipMax}%
        </span>
        <span
          class="gm-sp-weather-aqi"
          data-level={level.label}
          style={`--gm-sp-aqi-color: ${level.color}`}
        >
          {aq ? `${aq.us_aqi} ${level.label}` : '--'}
        </span>
      </div>
      <div class="gm-sp-weather-hourly">
        {indices.length === 0 ? (
          <div class="gm-sp-weather-hourly-empty">无小时数据</div>
        ) : (
          indices.map((i) => (
            <div class="gm-sp-weather-hour">
              <span class="gm-sp-weather-hour-time">{formatHourLabel(data.hourly.time[i]!)}</span>
              <span class="gm-sp-weather-hour-icon">
                {weatherCodeIcon(data.hourly.weather_code[i]!)}
              </span>
              <span class="gm-sp-weather-hour-temp">
                {Math.round(data.hourly.temperature_2m[i]!)}°
              </span>
              <span class="gm-sp-weather-hour-precip">
                {data.hourly.precipitation_probability[i] ?? 0}%
              </span>
            </div>
          ))
        )}
      </div>
      <div class="gm-sp-weather-daily">
        {Array.from({ length: dailyCount - 1 }, (_, j) => j + 1).map((j) => {
          const max = data.daily.temperature_2m_max[j]!
          const min = data.daily.temperature_2m_min[j]!
          const code = data.daily.weather_code[j]!
          const precip = data.daily.precipitation_probability_max[j] ?? 0
          return (
            <div class="gm-sp-weather-day">
              <span class="gm-sp-weather-day-label">+{j}</span>
              <span class="gm-sp-weather-day-icon">{weatherCodeIcon(code)}</span>
              <span>
                {Math.round(min)}° / {Math.round(max)}°
              </span>
              <span class="gm-sp-weather-day-precip">{precip}%</span>
            </div>
          )
        })}
        {sourceEl}
      </div>
    </div>
  )
}

function WeatherErrorBlock({ error }: { error: string }) {
  return (
    <div class="gm-sp-weather-city">
      <div class="gm-sp-weather-error">{error}</div>
    </div>
  )
}
