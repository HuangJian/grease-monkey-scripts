import type { Runtime } from '../../runtime'
import { escapeHtml } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { bindChipList, bindErrorBox, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorResult } from '../types'
import type { WeatherCity, WeatherSourceOptions } from './types'

export function createWeatherEditor(options: WeatherSourceOptions): SourceEditor {
  return (container, ctx) => renderWeatherEditor(container, options, ctx)
}

function coerceWeatherOptions(
  raw: Record<string, unknown>,
  fallback: WeatherSourceOptions,
): WeatherSourceOptions {
  const cities = raw['cities']
  return {
    cities:
      Array.isArray(cities) && cities.length > 0 ? (cities as WeatherCity[]) : fallback.cities,
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
  }
}

async function loadFreshWeatherOptions(
  runtime: Runtime,
  fallback: WeatherSourceOptions,
): Promise<WeatherSourceOptions> {
  return loadConfigSection(runtime, 'weather', fallback, (raw) =>
    coerceWeatherOptions(raw, fallback),
  )
}

async function renderWeatherEditor(
  container: HTMLElement,
  options: WeatherSourceOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<SourceEditorResult> {
  const fresh = await loadFreshWeatherOptions(ctx.runtime, options)

  const cities: WeatherCity[] = fresh.cities.map((c) => ({ ...c }))

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-editor">
      <div class="gm-sp-editor-list"></div>
      <div class="gm-sp-editor-form">
        <label class="gm-sp-editor-row">
          <span>城市名</span>
          <input type="text" class="gm-sp-input gm-sp-we-city-label" placeholder="北京" />
        </label>
        <label class="gm-sp-editor-row">
          <span>CMA 站点 ID</span>
          <input type="text" inputmode="numeric" pattern="\\d{5}"
                 class="gm-sp-input gm-sp-we-cma" placeholder="54511（可选）" />
        </label>
        <label class="gm-sp-editor-row">
          <span>纬度</span>
          <input type="number" step="any" class="gm-sp-input gm-sp-we-lat" placeholder="39.9042" />
        </label>
        <label class="gm-sp-editor-row">
          <span>经度</span>
          <input type="number" step="any" class="gm-sp-input gm-sp-we-lon" placeholder="116.4074" />
        </label>
        <button type="button" class="gm-sp-btn gm-sp-editor-btn" data-action="add">添加城市</button>
      </div>
      <div class="gm-sp-editor-error" hidden></div>
    </div>`,
  )

  const listEl = container.querySelector('.gm-sp-editor-list') as HTMLDivElement
  const labelInput = container.querySelector('.gm-sp-we-city-label') as HTMLInputElement
  const latInput = container.querySelector('.gm-sp-we-lat') as HTMLInputElement
  const lonInput = container.querySelector('.gm-sp-we-lon') as HTMLInputElement
  const cmaInput = container.querySelector('.gm-sp-we-cma') as HTMLInputElement
  const addBtn = container.querySelector('[data-action="add"]') as HTMLButtonElement
  const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement

  const error = bindErrorBox(errorEl)

  const chipList = bindChipList<WeatherCity>({
    listEl,
    addBtn,
    inputs: [labelInput, cmaInput],
    getItems: () => cities,
    setItems: (next) => {
      cities.length = 0
      cities.push(...next)
    },
    renderChip: (city, i) => {
      const coord = `${city.latitude.toFixed(4)}, ${city.longitude.toFixed(4)}`
      const cma = city.cmaStationId ? `CMA ${escapeHtml(city.cmaStationId)}` : ''
      return `<div class="gm-sp-editor-item" data-index="${i}">
          <span class="gm-sp-editor-item-label">${escapeHtml(city.cityLabel)}</span>
          <span class="gm-sp-editor-item-coord">${coord}</span>
          <span class="gm-sp-editor-item-cma">${cma}</span>
          <button type="button" class="gm-sp-item-remove" aria-label="remove">×</button>
        </div>`
    },
    removeSelector: '.gm-sp-item-remove',
    tryAdd: () => {
      const cityLabel = labelInput.value.trim()
      const lat = Number(latInput.value)
      const lon = Number(lonInput.value)
      const cmaStationId = cmaInput.value.trim()
      if (!cityLabel) return { ok: false, error: '请输入城市名' }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return { ok: false, error: '经纬度必须是有限数字' }
      }
      if (cmaStationId && !/^\d{5}$/.test(cmaStationId)) {
        return { ok: false, error: 'CMA 站点 ID 必须是 5 位数字' }
      }
      const city: WeatherCity = cmaStationId
        ? { cityLabel, latitude: lat, longitude: lon, cmaStationId }
        : { cityLabel, latitude: lat, longitude: lon }
      return { ok: true, item: city }
    },
    showError: (msg) => error.show(msg),
    clearError: () => error.clear(),
    emptyText: '尚未添加城市',
    emptyClass: 'gm-sp-editor-empty',
  })

  chipList.render()

  return {
    render() {},
    cancel() {
      ctx.close()
    },
    save() {
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
    },
  }
}
