/**
 * CMA page parsing.
 *
 * Parses CMA weather page HTML into structured weather data.
 */
import type { WeatherDaily, WeatherHourly } from '../types'
import { WMO_OVERCAST, CMA_WIND_DIR_TO_DEG } from './constants'
import {
  parseTemp,
  codeFromIcon,
  codeFromIconSrc,
  codeFromText,
  nextDate,
  extractIconSrcs,
  extractNumberCells,
  extractTextCells,
  extractPrecipCells,
} from './helpers'

export type CmaPageData = {
  daily: WeatherDaily
  hourly: WeatherHourly | null
  hourlyDayDates: string[]
}

export function parseCmaPage(html: string, DOMParserCtor: typeof DOMParser): CmaPageData | null {
  const parser = new DOMParserCtor()
  const doc = parser.parseFromString(html, 'text/html') as Document
  const dayNodes = doc.querySelectorAll('#dayList .pull-left.day')
  console.debug(
    '[gm-dashboard] cma.parseCmaPage: html length',
    html.length,
    'dayNodes',
    dayNodes.length,
  )
  if (dayNodes.length === 0) return null

  const dailyDates: string[] = []
  const tempMax: number[] = []
  const tempMin: number[] = []
  const weatherCodes: number[] = []
  const year = new Date().getFullYear()

  dayNodes.forEach((dayEl) => {
    const dateLabel = dayEl.querySelector('.day-item')?.textContent ?? ''
    const m = dateLabel.match(/(\d{1,2})\/(\d{1,2})/)
    if (!m) return
    const mm = m[1]!.padStart(2, '0')
    const dd = m[2]!.padStart(2, '0')
    const dateStr = `${year}-${mm}-${dd}`
    dailyDates.push(dateStr)

    const dayIcon = codeFromIcon(dayEl.querySelector('.day-item.dayicon img'))
    const dayText = codeFromText(dayEl.children[2]?.textContent ?? '')
    weatherCodes.push(dayIcon ?? dayText ?? WMO_OVERCAST)

    const high = parseTemp(dayEl.querySelector('.high')?.textContent ?? '')
    const low = parseTemp(dayEl.querySelector('.low')?.textContent ?? '')
    tempMax.push(high ?? Number.NaN)
    tempMin.push(low ?? Number.NaN)
  })

  if (dailyDates.length === 0) return null

  const daily: WeatherDaily = {
    time: dailyDates,
    temperature_2m_max: tempMax,
    temperature_2m_min: tempMin,
    weather_code: weatherCodes,
    precipitation_probability_max: [],
  }

  const hourly = parseCmaHourTable(doc, dailyDates)

  if (hourly) {
    console.debug(
      '[gm-dashboard] cma.parseCmaPage: ok daily',
      dailyDates.length,
      'hourly',
      hourly.hourly.time.length,
      'dayDates',
      hourly.dayDates,
    )
    return { daily, hourly: hourly.hourly, hourlyDayDates: hourly.dayDates }
  }

  console.debug('[gm-dashboard] cma.parseCmaPage: no hourly table, returning daily only')
  return { daily, hourly: null, hourlyDayDates: [] }
}

function parseCmaHourTable(
  doc: Document,
  dailyDates: string[],
): { hourly: WeatherHourly; dayDates: string[] } | null {
  const table = doc.querySelector('#hourTable_0 tbody')
  if (!table) {
    console.debug('[gm-dashboard] cma.parseCmaHourTable: no #hourTable_0 tbody')
    return null
  }
  const rows = table.querySelectorAll('tr')
  if (rows.length < 7) {
    console.debug('[gm-dashboard] cma.parseCmaHourTable: rows.length', rows.length, '< 7')
    return null
  }

  const timeRow = rows[0]!.querySelectorAll('td')
  if (timeRow.length < 2) {
    console.debug('[gm-dashboard] cma.parseCmaHourTable: timeRow tds', timeRow.length, '< 2')
    return null
  }
  const hours: number[] = []
  for (let i = 1; i < timeRow.length; i++) {
    const t = (timeRow[i]?.textContent ?? '').trim()
    const m = t.match(/^(\d{1,2}):\d{2}$/)
    if (!m) {
      console.debug('[gm-dashboard] cma.parseCmaHourTable: bad time cell', JSON.stringify(t))
      return null
    }
    hours.push(parseInt(m[1]!, 10))
  }

  const today = dailyDates[0]!
  const tomorrow = dailyDates[1] ?? nextDate(today)
  let wrapIdx = hours.length
  for (let i = 1; i < hours.length; i++) {
    if ((hours[i] ?? 0) < (hours[i - 1] ?? 0)) {
      wrapIdx = i
      break
    }
  }
  const dayDates = hours.map((_, i) => (i < wrapIdx ? today : tomorrow))

  const isoTimes = dayDates.map((d, i) => `${d}T${String(hours[i]!).padStart(2, '0')}:00`)

  const icons = extractIconSrcs(rows[1]!)
  const weathers = icons.map((src) => codeFromIconSrc(src) ?? WMO_OVERCAST)
  const temps = extractNumberCells(rows[2]!, /℃$/)
  const precips = extractPrecipCells(rows[3]!)
  const windSpeedsMs = rows.length > 4 ? extractNumberCells(rows[4]!, /m\/s$/) : []
  const windDirsText = rows.length > 5 ? extractTextCells(rows[5]!) : []
  const windDirs = windDirsText.map((t) => CMA_WIND_DIR_TO_DEG[t] ?? Number.NaN)
  const pressures = extractNumberCells(rows[6]!, /hPa$/)
  const humiditys = extractNumberCells(rows[7]!, /%$/)
  const cloudCovers = rows.length > 8 ? extractNumberCells(rows[8]!, /%$/) : []

  console.debug(
    '[gm-dashboard] cma.parseCmaHourTable: hours',
    hours,
    'wrapIdx',
    wrapIdx,
    'isoTimes',
    isoTimes,
  )

  return {
    hourly: {
      time: isoTimes,
      temperature_2m: temps,
      weather_code: weathers,
      precipitation_probability: [],
      pressure: pressures.length === hours.length ? pressures : undefined,
      humidity: humiditys.length === hours.length ? humiditys : undefined,
      cloud_cover: cloudCovers.length === hours.length ? cloudCovers : undefined,
      precipitation_amount: precips.length === hours.length ? precips : undefined,
      wind_speed_10m: windSpeedsMs.length === hours.length ? windSpeedsMs : undefined,
      wind_direction_10m:
        windDirs.length === hours.length && windDirs.every(Number.isFinite) ? windDirs : undefined,
    },
    dayDates,
  }
}
