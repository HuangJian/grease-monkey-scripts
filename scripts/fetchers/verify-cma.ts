/**
 * Standalone CMA fetcher verification script.
 *
 * Exercises the full CMA fetch pipeline (page HTML + now JSON) against the
 * real CMA APIs and prints parsed results. Uses the project's own parsing
 * modules (parseCmaPage, parseCmaNow) so it validates the actual production code.
 * Transparently solves SafeLine WAF challenges via the project's safeline module.
 *
 * Usage:
 *   bun scripts/verify-cma.ts [stationId]
 *
 * Default station: 54511 (Beijing)
 */

import { JSDOM } from 'jsdom'
import { parseCmaPage } from '../../src/prism/weather/cma/parse-page'
import { parseCmaNow } from '../../src/prism/weather/cma/parse-now'
import {
  isSafelineChallenge,
  parseSafelineChallenge,
  solveSafelinePow,
  extractSafelineCookie,
  buildSafelineCookieHeader,
} from '../../src/prism/weather/cma/safeline'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATION_ID = process.argv[2] ?? '54511'
const PAGE_URL = `https://weather.cma.cn/web/weather/${STATION_ID}.html`
const NOW_URL = `https://weather.cma.cn/api/now/${STATION_ID}`

function section(title: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(` ${title}`)
  console.log('='.repeat(60))
}

function print(label: string, value: unknown) {
  if (value === undefined) return
  if (value === null) {
    console.log(`  ${label}: null`)
    return
  }
  if (Array.isArray(value)) {
    const preview = value
      .slice(0, 8)
      .map((v) => (v === null ? 'null' : String(v)))
      .join(', ')
    const suffix = value.length > 8 ? ` ... +${value.length - 8} more` : ''
    console.log(`  ${label}: [${preview}${suffix}]`)
    return
  }
  if (typeof value === 'object') {
    console.log(`  ${label}:`)
    for (const [k, v] of Object.entries(value)) {
      console.log(`    ${k}: ${String(v)}`)
    }
    return
  }
  console.log(`  ${label}: ${value}`)
}

// ---------------------------------------------------------------------------
// WAF-aware fetch (uses Node/Bun fetch + safeline solver)
// ---------------------------------------------------------------------------

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchWithWaf(
  url: string,
  options: { headers?: Record<string, string> } = {},
): Promise<{ text: string; status: number; statusText: string }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, ...options.headers },
    signal: AbortSignal.timeout(15000),
  })
  const text = await res.text()

  if (!isSafelineChallenge(text)) {
    return { text, status: res.status, statusText: res.statusText }
  }

  console.log('  [WAF] Challenge detected, solving...')

  const challenge = parseSafelineChallenge(text)
  if (!challenge) {
    console.log('  [WAF] Could not parse challenge')
    return { text, status: res.status, statusText: res.statusText }
  }

  const setCookie = res.headers.get('set-cookie') ?? ''
  const cookie = extractSafelineCookie(`Set-Cookie: ${setCookie}`)
  if (!cookie) {
    console.log('  [WAF] No safeline_bot_challenge cookie in response headers')
    return { text, status: res.status, statusText: res.statusText }
  }

  console.log(`  [WAF] Challenge: ${JSON.stringify(challenge)}`)
  const suffix = solveSafelinePow(challenge.prefix, challenge.leadingZeroBits)
  console.log(`  [WAF] PoW solved, suffix=${suffix}`)

  const retryRes = await fetch(url, {
    headers: {
      'User-Agent': UA,
      ...options.headers,
      Cookie: buildSafelineCookieHeader(cookie, suffix),
    },
    signal: AbortSignal.timeout(15000),
  })
  const retryText = await retryRes.text()

  if (isSafelineChallenge(retryText)) {
    console.log('  [WAF] Retry still returned challenge')
  } else {
    console.log('  [WAF] Challenge solved successfully!')
  }

  return { text: retryText, status: retryRes.status, statusText: retryRes.statusText }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`CMA Fetcher Verification`)
  console.log(`Station ID : ${STATION_ID}`)
  console.log(`Page URL   : ${PAGE_URL}`)
  console.log(`Now URL    : ${NOW_URL}`)

  // --- Fetch both resources in parallel ---
  section('Fetching')

  const [pageRes, nowRes] = await Promise.allSettled([
    fetchWithWaf(PAGE_URL),
    fetchWithWaf(NOW_URL, { headers: { Referer: PAGE_URL } }),
  ])

  // --- Page HTML ---
  section('CMA Page HTML')

  if (pageRes.status === 'rejected') {
    console.error(`  FAILED: ${pageRes.reason}`)
  } else {
    const { text: html, status, statusText } = pageRes.value
    console.log(`  Status : ${status} ${statusText}`)
    console.log(`  Body   : ${html.length} chars`)

    const dom = new JSDOM(html)
    const parsed = parseCmaPage(html, dom.window.DOMParser)

    if (!parsed) {
      console.log('\n  ⚠️  parseCmaPage returned null — page structure may have changed')
    } else {
      console.log('\n  ✅ parseCmaPage OK')
      print('Daily dates', parsed.daily.time)
      print('Temp max', parsed.daily.temperature_2m_max)
      print('Temp min', parsed.daily.temperature_2m_min)
      print('Weather codes', parsed.daily.weather_code)
      print('Precipitation sum (daily)', parsed.daily.precipitation_sum)
      // 逐日打印日期+降水量
      if (parsed.daily.precipitation_sum) {
        console.log('\n  Daily precipitation breakdown:')
        parsed.daily.time.forEach((date, i) => {
          const sum = parsed.daily.precipitation_sum![i]
          console.log(`    ${date}: ${sum > 0 ? sum.toFixed(1) + 'mm' : '无降水'}`)
        })
      }

      if (parsed.hourly) {
        console.log('\n  Hourly data:')
        print('Times', parsed.hourly.time)
        print('Temps', parsed.hourly.temperature_2m)
        print('Weather codes', parsed.hourly.weather_code)
        print('Precipitation', parsed.hourly.precipitation_amount)
        print('Wind speed (m/s)', parsed.hourly.wind_speed_10m)
        print('Wind direction (deg)', parsed.hourly.wind_direction_10m)
        print('Pressure (hPa)', parsed.hourly.pressure)
        print('Humidity (%)', parsed.hourly.humidity)
        print('Cloud cover (%)', parsed.hourly.cloud_cover)
        // 按天分组打印小时降水量
        if (parsed.hourly.precipitation_amount) {
          console.log('\n  Hourly precipitation by day:')
          const byDay = new Map<string, { time: string; precip: number }[]>()
          parsed.hourly.time.forEach((t, i) => {
            const day = t.slice(0, 10)
            if (!byDay.has(day)) byDay.set(day, [])
            byDay.get(day)!.push({ time: t, precip: parsed.hourly!.precipitation_amount![i] })
          })
          for (const [day, items] of byDay) {
            console.log(`    ${day}:`)
            items.forEach(({ time, precip }) => {
              const h = time.slice(11, 16)
              console.log(`      ${h}: ${precip > 0 ? precip.toFixed(1) + 'mm' : '无降水'}`)
            })
            const sum = items.reduce((s, { precip }) => s + (precip > 0 ? precip : 0), 0)
            console.log(`      → 日合计: ${sum.toFixed(1)}mm`)
          }
        }
      } else {
        console.log('\n  No hourly data parsed')
      }
    }
  }

  // --- Now JSON ---
  section('CMA Now JSON')

  if (nowRes.status === 'rejected') {
    console.error(`  FAILED: ${nowRes.reason}`)
  } else {
    const { text, status, statusText } = nowRes.value
    console.log(`  Status : ${status} ${statusText}`)
    console.log(`  Body   : ${text.length} chars`)
    console.log(`  Preview: ${text.slice(0, 200)}`)

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      console.error('  ⚠️  Response is not valid JSON')
      return
    }

    const parsed = parseCmaNow(json)

    if (!parsed) {
      console.log('\n  ⚠️  parseCmaNow returned null — JSON structure may have changed')
    } else {
      console.log('\n  ✅ parseCmaNow OK')
      print('Last update', parsed.lastUpdate)
      print('Current time', parsed.current.time)
      print('Temperature', parsed.current.temperature_2m)
      print('Humidity', parsed.current.humidity)
      print('Pressure', parsed.current.pressure)
      print('Precipitation', parsed.current.precipitation)
      print('Wind speed (m/s)', parsed.current.wind_speed_10m)
      print('Wind direction (deg)', parsed.current.wind_direction_10m)
      print('Source', parsed.current.source)
    }
  }

  section('Done')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
