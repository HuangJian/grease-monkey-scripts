import type { Runtime } from '../../runtime'
import { htmlToElement } from '../../utils'
import { validateConfig } from '../config'
import { CONFIG_KEY } from '../types'
import type { SourceEditor } from '../types'
import type { WeatherCity } from './types'

export type WeatherEditorOptions = {
  cities: WeatherCity[]
  ttlMinutes: number
}

export function createWeatherEditor(options: WeatherEditorOptions): SourceEditor {
  return (container, ctx) => renderWeatherEditor(container, options, ctx)
}

async function loadFreshWeatherOptions(
  runtime: Runtime,
  fallback: WeatherEditorOptions,
): Promise<WeatherEditorOptions> {
  try {
    const stored = await runtime.getValue<Record<string, unknown> | null>(CONFIG_KEY, null)
    const weather = stored?.weather as { cities?: WeatherCity[]; ttlMinutes?: number } | undefined
    if (weather?.cities && Array.isArray(weather.cities) && weather.cities.length > 0) {
      return {
        cities: weather.cities,
        ttlMinutes:
          typeof weather.ttlMinutes === 'number' ? weather.ttlMinutes : fallback.ttlMinutes,
      }
    }
  } catch {}
  return fallback
}

async function renderWeatherEditor(
  container: HTMLElement,
  options: WeatherEditorOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<void> {
  const document = container.ownerDocument
  const fresh = await loadFreshWeatherOptions(ctx.runtime, options)

  const cities: WeatherCity[] = fresh.cities.map((c) => ({ ...c }))

  const form = htmlToElement<HTMLDivElement>(
    document,
    `<div class="gm-sp-weather-editor">
      <div class="gm-sp-weather-editor-list"></div>
      <div class="gm-sp-weather-editor-form">
        <label class="gm-sp-weather-editor-row">
          <span>城市名</span>
          <input type="text" class="gm-sp-we-city-label" placeholder="北京" />
        </label>
        <label class="gm-sp-weather-editor-row">
          <span>纬度</span>
          <input type="number" step="any" class="gm-sp-we-lat" placeholder="39.9042" />
        </label>
        <label class="gm-sp-weather-editor-row">
          <span>经度</span>
          <input type="number" step="any" class="gm-sp-we-lon" placeholder="116.4074" />
        </label>
        <label class="gm-sp-weather-editor-row">
          <span>CMA 站点 ID</span>
          <input type="text" inputmode="numeric" pattern="\\d{5}" class="gm-sp-we-cma" placeholder="54511（可选）" />
        </label>
        <button type="button" class="gm-sp-we-add">添加城市</button>
      </div>
      <div class="gm-sp-we-error" hidden></div>
      <div class="gm-sp-weather-editor-actions">
        <button type="button" class="gm-sp-we-save gm-sp-primary">保存</button>
        <button type="button" class="gm-sp-we-cancel">取消</button>
      </div>
    </div>`,
  )

  const listEl = form.querySelector('.gm-sp-weather-editor-list') as HTMLDivElement
  const labelInput = form.querySelector('.gm-sp-we-city-label') as HTMLInputElement
  const latInput = form.querySelector('.gm-sp-we-lat') as HTMLInputElement
  const lonInput = form.querySelector('.gm-sp-we-lon') as HTMLInputElement
  const cmaInput = form.querySelector('.gm-sp-we-cma') as HTMLInputElement
  const addBtn = form.querySelector('.gm-sp-we-add') as HTMLButtonElement
  const saveBtn = form.querySelector('.gm-sp-we-save') as HTMLButtonElement
  const cancelBtn = form.querySelector('.gm-sp-we-cancel') as HTMLButtonElement
  const errorEl = form.querySelector('.gm-sp-we-error') as HTMLDivElement

  function renderList(): void {
    listEl.replaceChildren()
    if (cities.length === 0) {
      const empty = htmlToElement<HTMLDivElement>(
        document,
        '<div class="gm-sp-we-empty">尚未添加城市</div>',
      )
      listEl.appendChild(empty)
      return
    }
    for (let i = 0; i < cities.length; i++) {
      const city = cities[i]
      const row = htmlToElement<HTMLDivElement>(
        document,
        `<div class="gm-sp-we-item">
          <span class="gm-sp-we-item-label"></span>
          <span class="gm-sp-we-item-coord"></span>
          <span class="gm-sp-we-item-cma"></span>
          <button type="button" class="gm-sp-we-remove" aria-label="remove">×</button>
        </div>`,
      )
      row.querySelector('.gm-sp-we-item-label')!.textContent = city.cityLabel
      row.querySelector('.gm-sp-we-item-coord')!.textContent =
        `${city.latitude.toFixed(4)}, ${city.longitude.toFixed(4)}`
      const cmaEl = row.querySelector('.gm-sp-we-item-cma') as HTMLSpanElement
      if (city.cmaStationId) {
        cmaEl.textContent = `CMA ${city.cmaStationId}`
      } else {
        cmaEl.textContent = ''
      }
      const remove = row.querySelector('.gm-sp-we-remove') as HTMLButtonElement
      remove.addEventListener('click', () => {
        cities.splice(i, 1)
        renderList()
      })
      listEl.appendChild(row)
    }
  }

  function showError(message: string): void {
    errorEl.textContent = message
    errorEl.hidden = false
  }

  function clearError(): void {
    errorEl.textContent = ''
    errorEl.hidden = true
  }

  function tryAdd(): void {
    clearError()
    const cityLabel = labelInput.value.trim()
    const lat = Number(latInput.value)
    const lon = Number(lonInput.value)
    const cmaStationId = cmaInput.value.trim()
    if (!cityLabel) {
      showError('请输入城市名')
      return
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      showError('经纬度必须是有限数字')
      return
    }
    if (cmaStationId && !/^\d{5}$/.test(cmaStationId)) {
      showError('CMA 站点 ID 必须是 5 位数字')
      return
    }
    const city: WeatherCity = cmaStationId
      ? { cityLabel, latitude: lat, longitude: lon, cmaStationId }
      : { cityLabel, latitude: lat, longitude: lon }
    cities.push(city)
    labelInput.value = ''
    latInput.value = ''
    lonInput.value = ''
    cmaInput.value = ''
    renderList()
  }

  addBtn.addEventListener('click', tryAdd)
  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      tryAdd()
    }
  })
  cmaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      tryAdd()
    }
  })

  cancelBtn.addEventListener('click', () => {
    ctx.close()
  })

  saveBtn.addEventListener('click', () => {
    clearError()
    if (cities.length === 0) {
      showError('至少保留一个城市')
      return
    }
    const patch = { weather: { cities, ttlMinutes: fresh.ttlMinutes } }
    const validation = validateConfig(patch)
    if (!validation.ok) {
      showError(validation.error)
      return
    }
    const result = ctx.runtime.getValue(CONFIG_KEY, null).then((existing) => {
      return ctx.runtime.setValue(CONFIG_KEY, { ...(existing ?? {}), ...patch })
    })
    Promise.resolve(result).then(() => {
      ctx.close()
    })
  })

  renderList()
  container.appendChild(form)
}
