import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'
import { validateConfig } from '../config'
import { bindErrorBox, saveConfigSection } from '../editor-helpers'
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
  const fresh = await loadFreshWeatherOptions(ctx.runtime, options)

  const cities: WeatherCity[] = fresh.cities.map((c) => ({ ...c }))

  container.insertAdjacentHTML(
    'beforeend',
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
          <input type="text" inputmode="numeric" pattern="\\d{5}"
                 class="gm-sp-we-cma" placeholder="54511（可选）" />
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

  const listEl = container.querySelector('.gm-sp-weather-editor-list') as HTMLDivElement
  const labelInput = container.querySelector('.gm-sp-we-city-label') as HTMLInputElement
  const latInput = container.querySelector('.gm-sp-we-lat') as HTMLInputElement
  const lonInput = container.querySelector('.gm-sp-we-lon') as HTMLInputElement
  const cmaInput = container.querySelector('.gm-sp-we-cma') as HTMLInputElement
  const addBtn = container.querySelector('.gm-sp-we-add') as HTMLButtonElement
  const saveBtn = container.querySelector('.gm-sp-we-save') as HTMLButtonElement
  const cancelBtn = container.querySelector('.gm-sp-we-cancel') as HTMLButtonElement
  const errorEl = container.querySelector('.gm-sp-we-error') as HTMLDivElement

  function renderList(): void {
    listEl.replaceChildren()
    if (cities.length === 0) {
      listEl.insertAdjacentHTML('beforeend', '<div class="gm-sp-we-empty">尚未添加城市</div>')
      return
    }
    listEl.insertAdjacentHTML(
      'beforeend',
      cities
        .map((city, i) => {
          const coord = `${city.latitude.toFixed(4)}, ${city.longitude.toFixed(4)}`
          const cma = city.cmaStationId ? `CMA ${escapeHtml(city.cmaStationId)}` : ''
          return `<div class="gm-sp-we-item" data-index="${i}">
          <span class="gm-sp-we-item-label">${escapeHtml(city.cityLabel)}</span>
          <span class="gm-sp-we-item-coord">${coord}</span>
          <span class="gm-sp-we-item-cma">${cma}</span>
          <button type="button" class="gm-sp-we-remove" aria-label="remove">×</button>
        </div>`
        })
        .join(''),
    )
    listEl.querySelectorAll<HTMLElement>('.gm-sp-we-item').forEach((row) => {
      const idx = Number(row.dataset['index']!)
      const remove = row.querySelector('.gm-sp-we-remove') as HTMLButtonElement
      remove.addEventListener('click', () => {
        cities.splice(idx, 1)
        renderList()
      })
    })
  }

  const error = bindErrorBox(errorEl)

  function tryAdd(): void {
    error.clear()
    const cityLabel = labelInput.value.trim()
    const lat = Number(latInput.value)
    const lon = Number(lonInput.value)
    const cmaStationId = cmaInput.value.trim()
    if (!cityLabel) {
      error.show('请输入城市名')
      return
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      error.show('经纬度必须是有限数字')
      return
    }
    if (cmaStationId && !/^\d{5}$/.test(cmaStationId)) {
      error.show('CMA 站点 ID 必须是 5 位数字')
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
    error.clear()
    if (cities.length === 0) {
      error.show('至少保留一个城市')
      return
    }
    void saveConfigSection({
      runtime: ctx.runtime,
      sectionKey: 'weather',
      section: { cities, ttlMinutes: fresh.ttlMinutes },
      validate: validateConfig,
      onError: (msg) => error.show(msg),
      onSuccess: () => ctx.close(),
    })
  })

  renderList()
}
