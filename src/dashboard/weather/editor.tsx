import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { escapeHtml } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
import type { WeatherCity, WeatherSourceOptions } from './types'

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

async function loadFreshOptions(
  runtime: import('../../runtime').Runtime,
  fallback: WeatherSourceOptions,
): Promise<WeatherSourceOptions> {
  return loadConfigSection(runtime, 'weather', fallback, (raw) =>
    coerceWeatherOptions(raw, fallback),
  )
}

type WeatherEditorFormProps = {
  fresh: WeatherSourceOptions
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function WeatherEditorForm({ fresh, ctx, handleRef }: WeatherEditorFormProps) {
  const [cities, setCities] = useState<WeatherCity[]>(() => fresh.cities.map((c) => ({ ...c })))
  const [error, setError] = useState('')
  const labelRef = useRef<HTMLInputElement>(null)
  const cmaRef = useRef<HTMLInputElement>(null)
  const latRef = useRef<HTMLInputElement>(null)
  const lonRef = useRef<HTMLInputElement>(null)

  const handleAdd = useCallback(() => {
    setError('')
    const label = labelRef.current?.value.trim()
    const cma = cmaRef.current?.value.trim()
    const lat = Number(latRef.current?.value)
    const lon = Number(lonRef.current?.value)
    if (!label) {
      setError('请输入城市名')
      return
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setError('经纬度必须是有限数字')
      return
    }
    if (cma && !/^\d{5}$/.test(cma)) {
      setError('CMA 站点 ID 必须是 5 位数字')
      return
    }
    const city: WeatherCity = cma
      ? { cityLabel: label, latitude: lat, longitude: lon, cmaStationId: cma }
      : { cityLabel: label, latitude: lat, longitude: lon }
    setCities((prev) => [...prev, city])
    if (labelRef.current) labelRef.current.value = ''
    if (cmaRef.current) cmaRef.current.value = ''
    if (latRef.current) latRef.current.value = ''
    if (lonRef.current) lonRef.current.value = ''
  }, [])

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd],
  )

  const removeCity = useCallback((i: number) => {
    setCities((prev) => prev.filter((_, j) => j !== i))
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        if (cities.length === 0) {
          setError('至少保留一个城市')
          return
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'weather',
          section: { cities, ttlMinutes: fresh.ttlMinutes } satisfies WeatherSourceOptions,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [cities])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-list">
        {cities.length === 0 ? (
          <div class="gm-sp-editor-empty">尚未添加城市</div>
        ) : (
          cities.map((city, i) => (
            <div class="gm-sp-editor-item" key={i}>
              <span class="gm-sp-editor-item-label">{escapeHtml(city.cityLabel)}</span>
              <span>
                {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
              </span>
              {city.cmaStationId && <span>CMA {escapeHtml(city.cmaStationId)}</span>}
              <button
                type="button"
                class="gm-sp-item-remove"
                aria-label="remove"
                onClick={() => removeCity(i)}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
      <div class="gm-sp-editor-form">
        <label class="gm-sp-editor-row">
          <span>城市名</span>
          <input
            ref={labelRef}
            type="text"
            class="gm-sp-input"
            placeholder="北京"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>CMA 站点 ID</span>
          <input
            ref={cmaRef}
            type="text"
            inputmode="numeric"
            pattern="\d{5}"
            class="gm-sp-input"
            placeholder="54511（可选）"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>纬度</span>
          <input
            ref={latRef}
            type="number"
            step="any"
            class="gm-sp-input"
            placeholder="39.9042"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>经度</span>
          <input
            ref={lonRef}
            type="number"
            step="any"
            class="gm-sp-input"
            placeholder="116.4074"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <button
          type="button"
          class="gm-sp-btn gm-sp-editor-btn"
          data-action="add"
          onClick={handleAdd}
        >
          添加城市
        </button>
      </div>
      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createWeatherEditor(options: WeatherSourceOptions): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(<WeatherEditorForm fresh={fresh} ctx={ctx} handleRef={handleRef} />, container)
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
