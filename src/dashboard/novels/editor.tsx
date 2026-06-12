import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { escapeHtml } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
import { adapterByHostname } from './adapters/registry'
import type { NovelEntry, NovelSourceOptions } from './types'
import type { Runtime } from '../../runtime'

export type NovelsEditorOptions = NovelSourceOptions & {
  getCachedTitles: () => Promise<Map<string, string>>
}

const ADVANCED_FIELDS: {
  prop: string
  label: string
  min: number
  errorMsg: string
}[] = [
  { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
  {
    prop: 'initialNewChapters',
    label: '初始新章数',
    min: 0,
    errorMsg: '初始新章数必须是 ≥0 的整数',
  },
  {
    prop: 'maxNewChaptersPerBook',
    label: '折叠阈值',
    min: 1,
    errorMsg: '折叠阈值必须是 ≥1 的整数',
  },
  { prop: 'maxLatestWindow', label: '章节窗口', min: 1, errorMsg: '章节窗口必须是 ≥1 的整数' },
]

function coerceNovelsOptions(
  raw: Record<string, unknown>,
  fallback: NovelSourceOptions,
): NovelSourceOptions {
  const entries = raw['entries']
  return {
    entries: Array.isArray(entries) ? (entries as NovelEntry[]) : fallback.entries,
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    maxNewChaptersPerBook:
      typeof raw['maxNewChaptersPerBook'] === 'number'
        ? (raw['maxNewChaptersPerBook'] as number)
        : fallback.maxNewChaptersPerBook,
    initialNewChapters:
      typeof raw['initialNewChapters'] === 'number'
        ? (raw['initialNewChapters'] as number)
        : fallback.initialNewChapters,
    maxLatestWindow:
      typeof raw['maxLatestWindow'] === 'number'
        ? (raw['maxLatestWindow'] as number)
        : fallback.maxLatestWindow,
  }
}

async function loadFreshOptions(
  runtime: Runtime,
  fallback: NovelSourceOptions,
): Promise<NovelSourceOptions> {
  return loadConfigSection(runtime, 'novels', fallback, (raw) => coerceNovelsOptions(raw, fallback))
}

function hostnameFor(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function isUnknownHost(url: string): boolean {
  const host = hostnameFor(url)
  return !host || !adapterByHostname(host)
}

type NovelsEditorFormProps = {
  fresh: NovelSourceOptions
  titleMap: Map<string, string>
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function NovelsEditorForm({ fresh, titleMap, ctx, handleRef }: NovelsEditorFormProps) {
  const [entries, setEntries] = useState<NovelEntry[]>(() => fresh.entries.map((e) => ({ ...e })))
  const [error, setError] = useState('')
  const [advanced, setAdvanced] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const f of ADVANCED_FIELDS) {
      const val = (fresh as Record<string, unknown>)[f.prop]
      out[f.prop] = typeof val === 'number' ? val : 0
    }
    return out
  })
  const urlRef = useRef<HTMLInputElement>(null)
  const aliasRef = useRef<HTMLInputElement>(null)
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
  }, [])

  const handleAdd = useCallback(() => {
    setError('')
    const url = urlRef.current?.value.trim()
    const alias = aliasRef.current?.value.trim()
    if (!url) {
      setError('请输入书库 URL')
      return
    }
    if (!hostnameFor(url)) {
      setError('URL 格式无效')
      return
    }
    if (entries.some((e) => e.url === url)) {
      setError('该书库已在列表中')
      return
    }
    const entry: NovelEntry = alias ? { url, alias } : { url }
    setEntries((prev) => [...prev, entry])
    if (urlRef.current) urlRef.current.value = ''
    if (aliasRef.current) aliasRef.current.value = ''
  }, [entries])

  const handleAddKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd],
  )

  const removeEntry = useCallback((i: number) => {
    setEntries((prev) => prev.filter((_, j) => j !== i))
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        const inputList = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          ADVANCED_FIELDS.map((f, i) => ({
            input: inputList[i],
            min: f.min,
            errorMessage: f.errorMsg,
          })),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const novels: NovelSourceOptions = {
          entries,
          ttlMinutes: Math.round(nums[0]),
          initialNewChapters: Math.round(nums[1]),
          maxNewChaptersPerBook: Math.round(nums[2]),
          maxLatestWindow: Math.round(nums[3]),
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'novels',
          section: novels,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => ctx.close(),
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [entries, advanced])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-list">
        {entries.length === 0 ? (
          <div class="gm-sp-editor-empty">尚未添加书库</div>
        ) : (
          entries.map((entry, i) => {
            const unknown = isUnknownHost(entry.url)
            const title = titleMap.get(entry.url)
            const display = entry.alias || title || entry.url
            return (
              <div class="gm-sp-editor-item" key={i}>
                <span class="gm-sp-editor-item-label">{escapeHtml(display)}</span>
                <span class="gm-sp-ne-item-url">{escapeHtml(entry.url)}</span>
                <span class="gm-sp-ne-item-warn" hidden={!unknown}>
                  未知站点
                </span>
                <button
                  type="button"
                  class="gm-sp-item-remove"
                  aria-label="remove"
                  onClick={() => removeEntry(i)}
                >
                  ×
                </button>
              </div>
            )
          })
        )}
      </div>
      <div class="gm-sp-editor-form-stacked">
        <label class="gm-sp-editor-row">
          <span>书库 URL</span>
          <input
            ref={urlRef}
            type="url"
            class="gm-sp-input"
            placeholder="https://www.sudugu.org/166/"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>别名（可选）</span>
          <input
            ref={aliasRef}
            type="text"
            class="gm-sp-input"
            placeholder="九龙夺嫡"
            onKeyDown={handleAddKeyDown}
          />
        </label>
        <button
          type="button"
          class="gm-sp-btn gm-sp-editor-btn"
          data-action="add"
          onClick={handleAdd}
        >
          添加书库
        </button>
      </div>
      <div class="gm-sp-editor-advanced">
        {ADVANCED_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{f.label}</span>
            <input
              ref={(el) => {
                advancedRefs.current[i] = el
              }}
              type="number"
              min={f.min}
              value={advanced[f.prop]}
              onInput={(e) =>
                onAdvancedChange(f.prop, Number((e.target as HTMLInputElement).value))
              }
            />
          </label>
        ))}
      </div>
      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createNovelsEditor(options: NovelsEditorOptions): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const titleMap = await options.getCachedTitles()
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(
      <NovelsEditorForm fresh={fresh} titleMap={titleMap} ctx={ctx} handleRef={handleRef} />,
      container,
    )
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
