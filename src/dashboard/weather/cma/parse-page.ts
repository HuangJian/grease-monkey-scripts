/**
 * CMA page parsing.
 *
 * Parses CMA weather page HTML into structured weather data.
 * The page contains multiple hour tables (hourTable_0..hourTable_6),
 * one per day. Each table has 8 hourly slots, starting from a future
 * hour and wrapping into the next day.
 */
import type { WeatherDaily, WeatherHourly } from '../types'
import { WMO_OVERCAST, CMA_WIND_DIR_TO_DEG } from './constants'
import {
  parseTemp,
  codeFromIcon,
  codeFromIconSrc,
  codeFromText,
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

  // 解析所有小时表格（hourTable_0..hourTable_N），合并数据
  const allHourly = parseAllCmaHourTables(doc, dailyDates)

  // 按 dayDates 分组累加小时降水量，生成日降水量
  const precipSum: number[] = new Array(dailyDates.length).fill(0)
  if (allHourly) {
    const dayIndexMap = new Map<string, number>()
    dailyDates.forEach((d, i) => dayIndexMap.set(d, i))
    allHourly.hourly.precipitation_amount?.forEach((p, i) => {
      const dayDate = allHourly.dayDates[i]
      const idx = dayIndexMap.get(dayDate)
      if (idx != null && p > 0) {
        precipSum[idx] = (precipSum[idx] ?? 0) + p
      }
    })
  }

  const hasPrecip = precipSum.some((s) => s > 0)
  const daily: WeatherDaily = {
    time: dailyDates,
    temperature_2m_max: tempMax,
    temperature_2m_min: tempMin,
    weather_code: weatherCodes,
    precipitation_probability_max: [],
    ...(hasPrecip ? { precipitation_sum: precipSum.map((s) => Math.round(s * 10) / 10) } : {}),
  }

  if (allHourly) {
    console.debug(
      '[gm-dashboard] cma.parseCmaPage: ok daily',
      dailyDates.length,
      'hourly slots',
      allHourly.hourly.time.length,
      'precipSum',
      precipSum,
    )
    return { daily, hourly: allHourly.hourly, hourlyDayDates: allHourly.dayDates }
  }

  console.debug('[gm-dashboard] cma.parseCmaPage: no hourly tables, returning daily only')
  return { daily, hourly: null, hourlyDayDates: [] }
}

/**
 * 解析单个小时表格，返回小时数据和对应的日期数组。
 * 每个表格从某个未来小时开始，包含 8 个时间点，可能跨天。
 */
function parseSingleCmaHourTable(
  table: Element,
  defaultDayDate: string,
): {
  times: string[]
  temps: number[]
  weatherCodes: number[]
  precipAmounts: number[]
  pressures: number[]
  humidities: number[]
  cloudCovers: number[]
  windSpeeds: number[]
  windDirs: number[]
  dayDates: string[]
} | null {
  const rows = table.querySelectorAll('tr')
  if (rows.length < 7) {
    console.debug('[gm-dashboard] cma.parseSingleCmaHourTable: rows.length', rows.length, '< 7')
    return null
  }

  const timeRow = rows[0]!.querySelectorAll('td')
  if (timeRow.length < 2) return null

  const hours: number[] = []
  for (let j = 1; j < timeRow.length; j++) {
    const t = (timeRow[j]?.textContent ?? '').trim()
    const m = t.match(/^(\d{1,2}):\d{2}$/)
    if (!m) {
      console.debug('[gm-dashboard] cma.parseSingleCmaHourTable: bad time cell', JSON.stringify(t))
      return null
    }
    hours.push(parseInt(m[1]!, 10))
  }

  // 跨天检测：当小时数回落时，后续时间属于下一天
  const dayDates: string[] = []
  let currentDay = defaultDayDate
  for (let i = 0; i < hours.length; i++) {
    if (i > 0 && hours[i]! < hours[i - 1]!) {
      // 跨天：计算下一天日期
      const prev = new Date(`${currentDay}T12:00:00`)
      prev.setDate(prev.getDate() + 1)
      currentDay = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
    }
    dayDates.push(currentDay)
  }

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

  const n = hours.length
  return {
    times: isoTimes,
    temps: temps.slice(0, n),
    weatherCodes: weathers.slice(0, n),
    precipAmounts: precips.slice(0, n),
    pressures: pressures.slice(0, n),
    humidities: humiditys.slice(0, n),
    cloudCovers: cloudCovers.slice(0, n),
    windSpeeds: windSpeedsMs.slice(0, n),
    windDirs: windDirs.slice(0, n),
    dayDates,
  }
}

/**
 * 解析所有小时表格（hourTable_0..hourTable_N），合并为一个 WeatherHourly。
 */
function parseAllCmaHourTables(
  doc: Document,
  dailyDates: string[],
): { hourly: WeatherHourly; dayDates: string[] } | null {
  const allTimes: string[] = []
  const allTemps: number[] = []
  const allWeatherCodes: number[] = []
  const allPrecipAmounts: number[] = []
  const allPressures: number[] = []
  const allHumidities: number[] = []
  const allCloudCovers: number[] = []
  const allWindSpeeds: number[] = []
  const allWindDirs: number[] = []
  const allDayDates: string[] = []

  for (let i = 0; i < dailyDates.length; i++) {
    const table = doc.querySelector(`#hourTable_${i} tbody`)
    if (!table) {
      console.debug(`[gm-dashboard] cma.parseAllCmaHourTables: no #hourTable_${i} tbody`)
      continue
    }
    const parsed = parseSingleCmaHourTable(table, dailyDates[i]!)
    if (!parsed) continue

    allTimes.push(...parsed.times)
    allTemps.push(...parsed.temps)
    allWeatherCodes.push(...parsed.weatherCodes)
    allPrecipAmounts.push(...parsed.precipAmounts)
    allPressures.push(...parsed.pressures)
    allHumidities.push(...parsed.humidities)
    allCloudCovers.push(...parsed.cloudCovers)
    allWindSpeeds.push(...parsed.windSpeeds)
    allWindDirs.push(...parsed.windDirs)
    allDayDates.push(...parsed.dayDates)
  }

  if (allTimes.length === 0) return null

  return {
    hourly: {
      time: allTimes,
      temperature_2m: allTemps,
      weather_code: allWeatherCodes,
      precipitation_probability: [],
      pressure: allPressures.length === allTimes.length ? allPressures : undefined,
      humidity: allHumidities.length === allTimes.length ? allHumidities : undefined,
      cloud_cover: allCloudCovers.length === allTimes.length ? allCloudCovers : undefined,
      precipitation_amount:
        allPrecipAmounts.length === allTimes.length ? allPrecipAmounts : undefined,
      wind_speed_10m: allWindSpeeds.length === allTimes.length ? allWindSpeeds : undefined,
      wind_direction_10m:
        allWindDirs.length === allTimes.length && allWindDirs.every(Number.isFinite)
          ? allWindDirs
          : undefined,
    },
    dayDates: allDayDates,
  }
}
