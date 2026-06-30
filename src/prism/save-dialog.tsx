import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import type { Runtime } from '../runtime'
import { handleEscapeKey } from './shortcut'
import { DateFilterGroup, type DateFilter } from './date-filter'
import { downloadJson } from './export-import'
import {
  describeKey,
  stateKeyForCache,
  buildSaveData,
  XUEQIU_NEWS_CACHE_KEY,
  XUEQIU_HOT_CACHE_KEY,
  type KeyCategory,
  type KeyDescription,
  type ReadState,
} from './save-filter'

type KeyEntry = KeyDescription & { key: string }

type SaveDialogProps = {
  root: ShadowRoot
  runtime: Runtime
  onClose: () => void
}

const CATEGORY_LABELS: Record<KeyCategory, string> = {
  cache: '缓存数据',
  state: '状态数据',
  tags: '标签数据',
}

const CATEGORY_ORDER: KeyCategory[] = ['cache', 'state', 'tags']

function formatSaveFilename(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `gm-dashboard-save-${yyyy}-${mm}-${dd}.json`
}

function SaveDialog({ root, runtime, onClose }: SaveDialogProps) {
  const [allKeys, setAllKeys] = useState<KeyEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<DateFilter>('全')
  const [filterUnread, setFilterUnread] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    panelRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    void runtime.listValues().then((keys) => {
      const entries: KeyEntry[] = []
      const seenKeys = new Set<string>()
      for (const key of keys) {
        const desc = describeKey(key)
        if (desc) {
          entries.push({ key, ...desc })
          seenKeys.add(key)
        }
      }
      // xueqiu-hot is virtual: its data lives inside xueqiu-news cache.
      // Add it as a checkbox when xueqiu-news exists.
      if (seenKeys.has(XUEQIU_NEWS_CACHE_KEY) && !seenKeys.has(XUEQIU_HOT_CACHE_KEY)) {
        const hotDesc = describeKey(XUEQIU_HOT_CACHE_KEY)
        if (hotDesc) {
          entries.push({ key: XUEQIU_HOT_CACHE_KEY, ...hotDesc })
        }
      }
      setAllKeys(entries)
      setSelected(new Set(entries.map((e) => e.key)))
    })
  }, [runtime])

  useLayoutEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      handleEscapeKey(e, root, onClose)
    }
    runtime.document.addEventListener('keydown', onKeydown, { capture: true })
    return () => runtime.document.removeEventListener('keydown', onKeydown, { capture: true })
  }, [root, runtime, onClose])

  const grouped = useMemo(() => {
    const groups: Record<KeyCategory, KeyEntry[]> = { cache: [], state: [], tags: [] }
    for (const entry of allKeys) {
      groups[entry.category].push(entry)
    }
    return groups
  }, [allKeys])

  function toggleKey(key: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleCategory(category: KeyCategory): void {
    setSelected((prev) => {
      const next = new Set(prev)
      const keys = grouped[category]
      const allSelected = keys.every((e) => next.has(e.key))
      if (allSelected) {
        keys.forEach((e) => next.delete(e.key))
      } else {
        keys.forEach((e) => next.add(e.key))
      }
      return next
    })
  }

  async function handleDownload(): Promise<void> {
    setDownloading(true)
    try {
      const selectedKeys = [...selected]
      // xueqiu-hot is virtual: load xueqiu-news value to access hotPosts data.
      const loadKeys = new Set(selectedKeys)
      if (loadKeys.has(XUEQIU_HOT_CACHE_KEY) && !loadKeys.has(XUEQIU_NEWS_CACHE_KEY)) {
        loadKeys.add(XUEQIU_NEWS_CACHE_KEY)
      }
      const values = new Map<string, unknown>()
      for (const key of loadKeys) {
        const value = await runtime.getValue<unknown>(key, null)
        if (value !== null) values.set(key, value)
      }

      const readStates = new Map<string, ReadState | null>()
      if (filterUnread) {
        const stateKeys = new Set<string>()
        for (const key of selectedKeys) {
          const stateKey = stateKeyForCache(key)
          if (stateKey) stateKeys.add(stateKey)
        }
        for (const stateKey of stateKeys) {
          const state = await runtime.getValue<ReadState | null>(stateKey, null)
          readStates.set(stateKey, state)
        }
      }

      const data = buildSaveData(selectedKeys, values, filter, filterUnread, readStates)
      downloadJson(runtime, data, formatSaveFilename())
      onClose()
    } catch (e) {
      runtime.alert('\u4FDD\u5B58\u5931\u8D25\uFF1A' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(false)
    }
  }

  const hasSelection = selected.size > 0

  return (
    <div
      class="gm-sp-editor-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="gm-sp-editor-dialog-panel gm-sp-save-dialog-panel" ref={panelRef} tabIndex={-1}>
        <div class="gm-sp-editor-dialog-header">
          <span class="gm-sp-editor-dialog-title">{'\u4FDD\u5B58\u6570\u636E'}</span>
          <div class="gm-sp-editor-dialog-actions">
            <button
              type="button"
              class="gm-sp-editor-btn gm-sp-btn gm-sp-btn-primary"
              onClick={() => void handleDownload()}
              disabled={downloading || !hasSelection}
            >
              {'\u4FDD\u5B58'}
            </button>
            <button type="button" class="gm-sp-editor-btn gm-sp-btn" onClick={onClose}>
              {'\u53D6\u6D88'}
            </button>
          </div>
        </div>
        <div class="gm-sp-editor-dialog-body">
          {allKeys.length === 0 ? (
            <div class="gm-sp-editor-empty">{'\u6682\u65E0\u53EF\u4FDD\u5B58\u6570\u636E'}</div>
          ) : (
            <>
              <div class="gm-sp-save-filter-section">
                <span class="gm-sp-save-filter-label">
                  {'\u65E5\u671F\u7B5B\u9009\uFF08\u4EC5\u7F13\u5B58\u6570\u636E\uFF09'}
                </span>
                <DateFilterGroup
                  value={filter}
                  onChange={setFilter}
                  filterUnread={filterUnread}
                  onToggleFilterUnread={() => setFilterUnread((v) => !v)}
                />
              </div>
              <div class="gm-sp-save-columns">
                {CATEGORY_ORDER.map((category) => {
                  const entries = grouped[category]
                  if (entries.length === 0) return null
                  const allSelected = entries.every((e) => selected.has(e.key))
                  return (
                    <div class="gm-sp-save-section" key={category}>
                      <div class="gm-sp-save-section-header">
                        <label class="gm-sp-save-checkbox">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={() => toggleCategory(category)}
                          />
                          <span class="gm-sp-save-section-title">{CATEGORY_LABELS[category]}</span>
                        </label>
                      </div>
                      <div class="gm-sp-save-checkbox-list">
                        {entries.map((entry) => (
                          <label class="gm-sp-save-checkbox" key={entry.key}>
                            <input
                              type="checkbox"
                              checked={selected.has(entry.key)}
                              onChange={() => toggleKey(entry.key)}
                            />
                            <span>{entry.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function showSaveDialog(root: ShadowRoot, runtime: Runtime): () => void {
  const container = runtime.document.createElement('div')
  root.appendChild(container)
  const close = () => {
    render(null, container)
    container.remove()
  }
  render(<SaveDialog root={root} runtime={runtime} onClose={close} />, container)
  return close
}
