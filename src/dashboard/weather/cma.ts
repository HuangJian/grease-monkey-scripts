import type { WeatherCurrent, WeatherDaily, WeatherHourly } from './types'

const WMO_CLEAR = 0
const WMO_MAINLY_CLEAR = 1
const WMO_PARTLY_CLOUDY = 2
const WMO_OVERCAST = 3
const WMO_FOG = 45
const WMO_DRIZZLE = 51
const WMO_RAIN = 61
const WMO_FREEZING_RAIN = 66
const WMO_SNOW = 71
const WMO_RAIN_SHOWER = 80
const WMO_SNOW_SHOWER = 85
const WMO_THUNDERSTORM = 95
const WMO_SAND = 3

const CMA_ICON_TO_CODE: Record<string, number> = {
  w0: WMO_CLEAR,
  w1: WMO_PARTLY_CLOUDY,
  w2: WMO_OVERCAST,
  w3: WMO_RAIN_SHOWER,
  w4: WMO_THUNDERSTORM,
  w5: WMO_RAIN_SHOWER,
  w6: WMO_RAIN,
  w7: WMO_RAIN,
  w8: WMO_FREEZING_RAIN,
  w9: WMO_DRIZZLE,
  w10: WMO_RAIN,
  w11: WMO_THUNDERSTORM,
  w12: WMO_SNOW,
  w13: WMO_SNOW_SHOWER,
  w14: WMO_FOG,
  w15: WMO_SAND,
  w16: WMO_SAND,
  w17: WMO_SAND,
  w18: WMO_FOG,
  w19: WMO_RAIN,
  w20: WMO_MAINLY_CLEAR,
  w21: WMO_RAIN_SHOWER,
  w22: WMO_SNOW,
  w23: WMO_SNOW,
  w24: WMO_SNOW,
  w25: WMO_SNOW,
  w26: WMO_SNOW,
  w27: WMO_SAND,
  w28: WMO_FOG,
  w29: WMO_RAIN,
  w30: WMO_MAINLY_CLEAR,
  w31: WMO_MAINLY_CLEAR,
  w32: WMO_RAIN,
}

const CMA_TEXT_TO_CODE: Record<string, number> = {
  晴: WMO_CLEAR,
  多云: WMO_PARTLY_CLOUDY,
  阴: WMO_OVERCAST,
  阵雨: WMO_RAIN_SHOWER,
  雷阵雨: WMO_THUNDERSTORM,
  雨夹雪: WMO_FREEZING_RAIN,
  小雨: WMO_RAIN,
  中雨: WMO_RAIN,
  大雨: WMO_RAIN,
  暴雨: WMO_RAIN,
  雾: WMO_FOG,
  霾: WMO_FOG,
  小雪: WMO_SNOW,
  中雪: WMO_SNOW,
  大雪: WMO_SNOW,
  暴雪: WMO_SNOW,
  扬沙: WMO_SAND,
  沙尘暴: WMO_SAND,
  浮尘: WMO_SAND,
}

const CMA_WIND_DIR_TO_DEG: Record<string, number> = {
  北风: 0,
  东北风: 45,
  东风: 90,
  东南风: 135,
  南风: 180,
  西南风: 225,
  西风: 270,
  西北风: 315,
  北东北风: 22.5,
  东北东风: 67.5,
  东东南风: 112.5,
  东南南风: 157.5,
  南西南风: 202.5,
  西南西风: 247.5,
  西西北风: 292.5,
  西北北风: 337.5,
}

const BEAUFORT_MIDPOINT_MS: number[] = [
  0, 0.9, 2.45, 4.4, 6.7, 9.35, 12.3, 15.5, 18.95, 22.55, 26.45, 30.55, 34.85, 39.35, 44.05, 48.95,
  54.05,
]

const MISSING_TEMP = 9999

export type CmaPageData = {
  daily: WeatherDaily
  hourly: WeatherHourly
  hourlyDayDates: string[]
}

export function parseCmaPage(html: string, DOMParserCtor: typeof DOMParser): CmaPageData | null {
  const parser = new DOMParserCtor()
  const doc = parser.parseFromString(html, 'text/html') as Document
  const dayNodes = doc.querySelectorAll('#dayList .pull-left.day')
  console.log('[cma] parseCmaPage: html length', html.length, 'dayNodes', dayNodes.length)
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
  if (!hourly) {
    console.log('[cma] parseCmaPage: parseCmaHourTable returned null')
    return null
  }

  console.log(
    '[cma] parseCmaPage: ok daily',
    dailyDates.length,
    'hourly',
    hourly.hourly.time.length,
    'dayDates',
    hourly.dayDates,
  )
  return { daily, hourly: hourly.hourly, hourlyDayDates: hourly.dayDates }
}

function parseCmaHourTable(
  doc: Document,
  dailyDates: string[],
): { hourly: WeatherHourly; dayDates: string[] } | null {
  const table = doc.querySelector('#hourTable_0 tbody')
  if (!table) {
    console.log('[cma] parseCmaHourTable: no #hourTable_0 tbody')
    return null
  }
  const rows = table.querySelectorAll('tr')
  if (rows.length < 7) {
    console.log('[cma] parseCmaHourTable: rows.length', rows.length, '< 7')
    return null
  }

  const timeRow = rows[0]!.querySelectorAll('td')
  if (timeRow.length < 2) {
    console.log('[cma] parseCmaHourTable: timeRow tds', timeRow.length, '< 2')
    return null
  }
  const hours: number[] = []
  for (let i = 1; i < timeRow.length; i++) {
    const t = (timeRow[i]?.textContent ?? '').trim()
    const m = t.match(/^(\d{1,2}):\d{2}$/)
    if (!m) {
      console.log('[cma] parseCmaHourTable: bad time cell', JSON.stringify(t))
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
  const pressures = extractNumberCells(rows[6]!, /hPa$/)
  const humiditys = extractNumberCells(rows[7]!, /%$/)
  const cloudCovers = rows.length > 8 ? extractNumberCells(rows[8]!, /%$/) : []

  console.log('[cma] parseCmaHourTable: hours', hours, 'wrapIdx', wrapIdx, 'isoTimes', isoTimes)

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
    },
    dayDates,
  }
}

function extractIconSrcs(row: Element): string[] {
  const cells = row.querySelectorAll('td.wicon img')
  return Array.from(cells).map((c) => c.getAttribute('src') ?? '')
}

function extractNumberCells(row: Element, suffix: RegExp): number[] {
  const cells = row.querySelectorAll('td')
  const out: number[] = []
  for (let i = 1; i < cells.length; i++) {
    const t = (cells[i]?.textContent ?? '').trim().replace(suffix, '')
    const n = parseFloat(t)
    if (Number.isFinite(n)) out.push(n)
  }
  return out
}

function extractPrecipCells(row: Element): (number | null)[] {
  const cells = row.querySelectorAll('td')
  const out: (number | null)[] = []
  for (let i = 1; i < cells.length; i++) {
    const t = (cells[i]?.textContent ?? '').trim()
    if (t === '无降水' || t === '--') {
      out.push(null)
      continue
    }
    const m = t.match(/^([\d.]+)mm$/)
    if (m) {
      out.push(parseFloat(m[1]!))
    } else {
      out.push(null)
    }
  }
  return out
}

function nextDate(yyyyMmDd: string): string {
  const d = new Date(`${yyyyMmDd}T12:00:00`)
  d.setDate(d.getDate() + 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function parseTemp(text: string): number | null {
  const m = text.trim().match(/^(-?[\d.]+)/)
  if (!m) return null
  const n = parseFloat(m[1]!)
  if (!Number.isFinite(n) || n >= MISSING_TEMP) return null
  return n
}

function codeFromIcon(img: Element | null | undefined): number | null {
  if (!img) return null
  return codeFromIconSrc(img.getAttribute('src') ?? '')
}

function codeFromIconSrc(src: string): number | null {
  const m = src.match(/\/w(\d+)\.png$/)
  if (!m) return null
  return CMA_ICON_TO_CODE[`w${m[1]!}`] ?? null
}

function codeFromText(text: string): number | null {
  const t = text.trim()
  for (const [k, v] of Object.entries(CMA_TEXT_TO_CODE)) {
    if (t.includes(k)) return v
  }
  return null
}

export type CmaNow = {
  current: WeatherCurrent
  lastUpdate: string
}

export function parseCmaNow(json: unknown): CmaNow | null {
  if (!json || typeof json !== 'object') {
    console.log('[cma] parseCmaNow: json is not an object')
    return null
  }
  const obj = json as Record<string, unknown>
  if (obj['code'] !== 0) {
    console.log('[cma] parseCmaNow: code is not 0:', obj['code'])
    return null
  }
  const data = obj['data'] as Record<string, unknown> | undefined
  if (!data) {
    console.log('[cma] parseCmaNow: no data field')
    return null
  }
  const now = data['now'] as Record<string, unknown> | undefined
  if (!now) {
    console.log('[cma] parseCmaNow: no data.now field')
    return null
  }

  const temperature = numOrNull(now['temperature'])
  const pressure = numOrNull(now['pressure'])
  const humidity = numOrNull(now['humidity'])
  const precipitation = numOrNull(now['precipitation'])
  const dirText = (now['windDirection'] as string | undefined)?.trim() ?? ''
  const scaleText = (now['windScale'] as string | undefined)?.trim() ?? ''

  const current: WeatherCurrent = {
    time:
      typeof data['lastUpdate'] === 'string'
        ? (data['lastUpdate'] as string)
        : new Date().toISOString(),
    temperature_2m: temperature ?? 0,
    apparent_temperature: temperature ?? 0,
    weather_code: WMO_OVERCAST,
    wind_speed_10m: parseBeaufortText(scaleText) ?? 0,
    wind_direction_10m: CMA_WIND_DIR_TO_DEG[dirText] ?? 0,
    air_quality: null,
    humidity: humidity ?? undefined,
    pressure: pressure ?? undefined,
    precipitation: precipitation ?? undefined,
    source: 'cma',
  }

  console.log('[cma] parseCmaNow: ok', {
    time: current.time,
    temp: current.temperature_2m,
    dirText,
    scaleText,
  })

  return {
    current,
    lastUpdate: typeof data['lastUpdate'] === 'string' ? (data['lastUpdate'] as string) : '',
  }
}

function numOrNull(v: unknown): number | null {
  if (typeof v !== 'number') return null
  if (!Number.isFinite(v) || v >= MISSING_TEMP) return null
  return v
}

function parseBeaufortText(text: string): number | null {
  const m = text.match(/^(\d{1,2})级/)
  if (!m) return null
  const idx = parseInt(m[1]!, 10)
  return BEAUFORT_MIDPOINT_MS[idx] ?? null
}
