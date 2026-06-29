/**
 * Novels editor form component.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { escapeHtml } from '../../../utils'
import { validateConfig } from '../../config'
import { readNumberFields, saveConfigSection, saveSourceSettings } from '../../editor-helpers'
import type {
  SourceEditor,
  SourceEditorContext,
  SourceEditorResult,
  SourceSettings,
  BadgeType,
} from '../../types'
import type { NovelEntry, NovelSourceOptions } from '../types'
import { ADVANCED_FIELDS } from './types'
import { hostnameFor, isUnknownHost, loadFreshOptions } from './helpers'

export type NovelsEditorOptions = NovelSourceOptions & {
  getCachedTitles: () => Promise<Map<string, string>>
}

type NovelsEditorFormProps = {
  fresh: NovelSourceOptions
  titleMap: Map<string, string>
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

export function NovelsEditorForm({
  fresh,
  titleMap,
  settings,
  ctx,
  handleRef,
}: NovelsEditorFormProps) {
  const [entries, setEntries] = useState<NovelEntry[]>(() => fresh.entries.map((e) => ({ ...e })))
  const [error, setError] = useState('')
  const [advanced, setAdvanced] = useState<Record<string, number>>(() =>
    ADVANCED_FIELDS.reduce(
      (out, f) => {
        const val = (fresh as Record<string, unknown>)[f.prop]
        out[f.prop] = typeof val === 'number' ? val : 0
        return out
      },
      {} as Record<string, number>,
    ),
  )
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
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
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'novels', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [entries, advanced, tabTitle, priority, badgeType])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-source-settings">
        <label class="gm-sp-editor-row">
          <span>Tab 标题</span>
          <input
            type="text"
            class="gm-sp-input"
            placeholder="留空使用默认"
            value={tabTitle}
            onInput={(e) => setTabTitle((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>优先级</span>
          <input
            type="number"
            class="gm-sp-input"
            value={priority}
            onInput={(e) => setPriority(Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label class="gm-sp-editor-row">
          <span>Badge 显示</span>
          <select
            class="gm-sp-input"
            value={badgeType}
            onChange={(e) => setBadgeType((e.target as HTMLSelectElement).value as BadgeType)}
          >
            <option value="default">默认</option>
            <option value="none">不显示</option>
            <option value="allUnread">全部未读数</option>
          </select>
        </label>
      </div>
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
              class="gm-sp-input"
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

export function createNovelsEditor(
  options: NovelsEditorOptions,
  settings: SourceSettings,
): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const titleMap = await options.getCachedTitles()
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(
      <NovelsEditorForm
        fresh={fresh}
        titleMap={titleMap}
        settings={settings}
        ctx={ctx}
        handleRef={handleRef}
      />,
      container,
    )
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
