import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { numberOrDefault } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { createEditorFactory } from '../editor-helpers/createEditorFactory'
import { ArrowDownIcon, ArrowUpIcon, DeleteIcon } from '../shared/icons'
import { EditorListToolbar } from '../editor-helpers/list-toolbar'
import { useRowBrowser } from '../editor-helpers/useRowBrowser'
import { saveConfigSection } from '../editor-helpers'
import type { SourceEditorContext, SourceEditorResult } from '../types'
import type { WeatherCity, WeatherSourceOptions } from './types'

function coerceWeatherOptions(
  raw: Record<string, unknown>,
  fallback: WeatherSourceOptions,
): WeatherSourceOptions {
  const cities = raw['cities']
  return {
    cities:
      Array.isArray(cities) && cities.length > 0 ? (cities as WeatherCity[]) : fallback.cities,
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
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

/** Cities per page — twenty rows of coordinates is where scrolling starts to hurt. */
const CITIES_PER_PAGE = 20

/** Module-level so the hook's memo dependency stays stable. */
function matchesCity(city: { cityLabel: string }, needle: string): boolean {
  return city.cityLabel.toLowerCase().includes(needle)
}

function WeatherEditorForm({ fresh, ctx, handleRef }: WeatherEditorFormProps) {
  const [cities, setCities] = useState<WeatherCity[]>(() => fresh.cities.map((c) => ({ ...c })))
  const [ttlMinutes, setTtlMinutes] = useState(fresh.ttlMinutes)
  const [error, setError] = useState('')
  /** Unapplied label renames, keyed by the label they would replace. */
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const browser = useRowBrowser(cities, CITIES_PER_PAGE, matchesCity)
  const selectedCities = cities
    .filter((city) => browser.selected.has(city.cityLabel))
    .map((city) => city.cityLabel)
  const labelRef = useRef<HTMLInputElement>(null)
  const cmaRef = useRef<HTMLInputElement>(null)
  const latRef = useRef<HTMLInputElement>(null)
  const lonRef = useRef<HTMLInputElement>(null)

  const handleAdd = useCallback(() => {
    setError('')
    const label = labelRef.current?.value.trim()
    const cma = cmaRef.current?.value.trim() ?? ''
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
    const city: WeatherCity = { cityLabel: label, latitude: lat, longitude: lon, cmaStationId: cma }
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

  const updateCity = useCallback((index: number, patch: Partial<WeatherCity>) => {
    setCities((prev) => prev.map((c, j) => (j === index ? { ...c, ...patch } : c)))
  }, [])

  const moveCityUp = useCallback((i: number) => {
    if (i <= 0) return
    setCities((prev) => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
      return next
    })
  }, [])

  /** The city label is the row's key, so a rename goes through the browser. */
  const commitRename = useCallback(
    (index: number, oldLabel: string) => {
      const draft = drafts[oldLabel]
      if (draft === undefined) return
      const next = draft.trim()
      setDrafts((prev) => {
        const { [oldLabel]: _dropped, ...rest } = prev
        return rest
      })
      if (!next || next === oldLabel) return
      if (cities.some((c) => c.cityLabel === next)) {
        setError(`城市「${next}」已在列表中`)
        return
      }
      setError('')
      updateCity(index, { cityLabel: next })
      browser.renameKey(oldLabel, next)
    },
    [cities, drafts, browser, updateCity],
  )

  const moveCityDown = useCallback((i: number) => {
    setCities((prev) => {
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1]!, next[i]!]
      return next
    })
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      // One row carries name, coordinates, CMA id and three actions.
      size: 'lg',
      save() {
        setError('')
        if (cities.length === 0) {
          setError('至少保留一个城市')
          return
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'weather',
          section: { cities, ttlMinutes } satisfies WeatherSourceOptions,
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
  }, [cities, ttlMinutes])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
      <EditorListToolbar
        query={browser.query}
        onQuery={browser.setQuery}
        queryPlaceholder="搜索城市"
        counter={
          browser.visible.length === cities.length
            ? `共 ${cities.length} 个城市`
            : `共 ${cities.length} · 命中 ${browser.visible.length}`
        }
        page={browser.page}
        pageCount={browser.pages}
        onPage={browser.setPage}
        selection={{
          selectedCount: selectedCities.length,
          allSelected:
            browser.visible.length > 0 && selectedCities.length === browser.visible.length,
          onSelectAll: (checked) =>
            browser.setSelected(
              checked ? new Set(browser.visible.map((c) => c.cityLabel)) : new Set(),
            ),
          actions: [
            { label: '删除', action: 'bulk-remove', onClick: () => browser.setConfirmRemove(true) },
          ],
        }}
      />

      {browser.confirmRemove ? (
        <div class="gm-sp-editor-confirm-inline" data-action="bulk-remove-guard">
          <span>{`删除选中的 ${selectedCities.length} 个城市？该操作不可撤销。`}</span>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-danger"
            data-action="bulk-remove-confirm"
            onClick={() => {
              const gone = new Set(selectedCities)
              setCities((prev) => prev.filter((c) => !gone.has(c.cityLabel)))
              browser.setSelected(new Set())
              browser.setConfirmRemove(false)
            }}
          >
            删除
          </button>
          <button
            type="button"
            class="gm-sp-editor-btn gm-sp-btn"
            onClick={() => browser.setConfirmRemove(false)}
          >
            取消
          </button>
        </div>
      ) : null}

      <div class="gm-sp-editor-list">
        {browser.rows.length === 0 ? (
          <div class="gm-sp-editor-empty">
            {cities.length === 0 ? '尚未添加城市' : '没有符合条件的城市'}
          </div>
        ) : (
          browser.rows.map((city) => {
            const index = cities.indexOf(city)
            const open = browser.expanded.has(city.cityLabel)
            return (
              <div
                class={`gm-sp-editor-item gm-sp-we-city${open ? ' gm-sp-we-city-open' : ''}`}
                key={city.cityLabel}
                data-city={city.cityLabel}
              >
                <label class="gm-sp-we-city-pick">
                  <input
                    type="checkbox"
                    data-action="city-pick"
                    checked={browser.selected.has(city.cityLabel)}
                    onChange={() => browser.toggleSelected(city.cityLabel)}
                  />
                </label>
                <button
                  type="button"
                  class="gm-sp-re-feed-toggle"
                  data-action="city-toggle"
                  aria-expanded={open}
                  title={open ? '收起' : '展开编辑'}
                  onClick={() => browser.toggleExpanded(city.cityLabel)}
                >
                  {open ? '▾' : '▸'}
                </button>
                <span
                  class="gm-sp-we-city-name"
                  data-action="city-name"
                  title={city.cityLabel}
                  onClick={() => browser.toggleExpanded(city.cityLabel)}
                >
                  {city.cityLabel}
                </span>
                <span class="gm-sp-we-city-meta">
                  {city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}
                  {city.cmaStationId ? ` · CMA ${city.cmaStationId}` : ''}
                </span>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move up"
                  disabled={index <= 0}
                  onClick={() => moveCityUp(index)}
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-move"
                  aria-label="move down"
                  disabled={index >= cities.length - 1}
                  onClick={() => moveCityDown(index)}
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  class="gm-sp-item-remove"
                  aria-label="remove"
                  onClick={() => removeCity(index)}
                >
                  <DeleteIcon />
                </button>
                {open ? (
                  <div class="gm-sp-we-city-detail">
                    <label class="gm-sp-editor-row">
                      <span>城市名</span>
                      <input
                        type="text"
                        class="gm-sp-input"
                        data-action="city-rename"
                        value={drafts[city.cityLabel] ?? city.cityLabel}
                        onInput={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [city.cityLabel]: (e.target as HTMLInputElement).value,
                          }))
                        }
                        onBlur={() => commitRename(index, city.cityLabel)}
                      />
                    </label>
                    <label class="gm-sp-editor-row">
                      <span>CMA 站点 ID</span>
                      <input
                        type="text"
                        inputmode="numeric"
                        class="gm-sp-input"
                        value={city.cmaStationId}
                        onBlur={(e) =>
                          updateCity(index, {
                            cmaStationId: (e.target as HTMLInputElement).value.trim(),
                          })
                        }
                      />
                    </label>
                    <label class="gm-sp-editor-row">
                      <span>纬度</span>
                      <input
                        type="number"
                        step="any"
                        class="gm-sp-input"
                        value={city.latitude}
                        onBlur={(e) =>
                          updateCity(index, {
                            latitude: Number((e.target as HTMLInputElement).value),
                          })
                        }
                      />
                    </label>
                    <label class="gm-sp-editor-row">
                      <span>经度</span>
                      <input
                        type="number"
                        step="any"
                        class="gm-sp-input"
                        value={city.longitude}
                        onBlur={(e) =>
                          updateCity(index, {
                            longitude: Number((e.target as HTMLInputElement).value),
                          })
                        }
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
      <div class="gm-sp-editor-form gm-sp-weather-editor-form">
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
        <hr class="gm-sp-editor-row-span2" style="width: 100%" />
        <label class="gm-sp-editor-row gm-sp-editor-row-span2">
          <span>刷新周期（分钟）</span>
          <input
            type="number"
            class="gm-sp-input"
            min="1"
            value={ttlMinutes}
            onInput={(e) => setTtlMinutes(Number((e.target as HTMLInputElement).value))}
          />
        </label>
      </div>
    </div>
  )
}

export function createWeatherEditor(options: WeatherSourceOptions) {
  return createEditorFactory(
    (runtime) => loadFreshOptions(runtime, options),
    WeatherEditorForm,
    (fresh) => ({ fresh }),
  )
}
