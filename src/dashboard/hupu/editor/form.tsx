/**
 * Hupu editor form component.
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
import { normalizeBoardSlug } from '../parser'
import type { HupuSourceOptions } from '../types'
import { loadFreshHupuOptions } from '../source'
import { FORM_FIELDS } from './types'

type HupuEditorFormProps = {
  fresh: HupuSourceOptions
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

export function HupuEditorForm({ fresh, settings, ctx, handleRef }: HupuEditorFormProps) {
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  const [boards, setBoards] = useState<string[]>(() =>
    fresh.boards.map(normalizeBoardSlug).filter((s) => s.length > 0),
  )
  const [error, setError] = useState('')
  const [advanced, setAdvanced] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const f of FORM_FIELDS) {
      const val = (fresh as Record<string, unknown>)[f.prop]
      out[f.prop] = typeof val === 'number' ? val : 0
    }
    return out
  })
  const inputRef = useRef<HTMLInputElement>(null)
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
  }, [])

  const tryAdd = useCallback(() => {
    setError('')
    const val = inputRef.current?.value ?? ''
    const normalized = normalizeBoardSlug(val)
    if (!normalized) {
      setError('请输入有效的版块标识')
      return
    }
    if (boards.includes(normalized)) {
      setError(`${normalized} 已在列表中`)
      return
    }
    setBoards((prev) => [...prev, normalized])
    if (inputRef.current) inputRef.current.value = ''
  }, [boards])

  const onAddKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        tryAdd()
      }
    },
    [tryAdd],
  )

  const removeBoard = useCallback((i: number) => {
    setBoards((prev) => prev.filter((_, j) => j !== i))
  }, [])

  const moveUp = useCallback((i: number) => {
    if (i <= 0) return
    setBoards((prev) => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
      return next
    })
  }, [])

  const moveDown = useCallback((i: number) => {
    setBoards((prev) => {
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1]!, next[i]!]
      return next
    })
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        if (boards.length === 0) {
          setError('至少添加一个版块')
          return
        }
        const inputList = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          FORM_FIELDS.map((f, i) => ({
            input: inputList[i],
            min: f.min,
            max: f.max,
            errorMessage: f.errorMsg,
          })),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const hupu: HupuSourceOptions = {
          ttlMinutes: Math.round(nums[0]),
          historyDays: Math.round(nums[1]),
          todayMinReplies: Math.round(nums[2]),
          olderMinReplies: Math.round(nums[3]),
          ageHalfLifeDays: nums[4],
          lightsWeight: nums[5],
          repliesWeight: nums[6],
          boards: [...boards],
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'hupu',
          section: hupu,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'hupu', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [boards, advanced, tabTitle, priority, badgeType])

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
            value={badgeType}
            onChange={(e) => setBadgeType((e.target as HTMLSelectElement).value as BadgeType)}
          >
            <option value="default">默认</option>
            <option value="none">不显示</option>
            <option value="allUnread">全部未读数</option>
            <option value="todayUnread">今日未读数</option>
          </select>
        </label>
      </div>
      <div class="gm-sp-editor-section">
        <div class="gm-sp-editor-label">版块列表</div>
        <div class="gm-sp-re-list">
          {boards.length === 0 ? (
            <div class="gm-sp-editor-empty">尚未添加版块</div>
          ) : (
            boards.map((name, i) => (
              <div class="gm-sp-editor-chip" key={i} data-index={i}>
                <button
                  type="button"
                  class="gm-sp-editor-chip-move"
                  aria-label="move up"
                  disabled={i === 0}
                  onClick={() => moveUp(i)}
                >
                  ▲
                </button>
                <button
                  type="button"
                  class="gm-sp-editor-chip-move"
                  aria-label="move down"
                  disabled={i === boards.length - 1}
                  onClick={() => moveDown(i)}
                >
                  ▼
                </button>
                <span class="gm-sp-editor-chip-label">{escapeHtml(name)}</span>
                <button
                  type="button"
                  class="gm-sp-editor-chip-remove"
                  aria-label="remove"
                  onClick={() => removeBoard(i)}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <div class="gm-sp-editor-add-row">
          <input
            ref={inputRef}
            type="text"
            class="gm-sp-input gm-sp-editor-input"
            placeholder="vote-hot 或 bxj"
            onKeyDown={onAddKeyDown}
          />
          <button
            type="button"
            class="gm-sp-btn gm-sp-editor-btn"
            data-action="add"
            onClick={tryAdd}
          >
            添加
          </button>
        </div>
      </div>
      <div class="gm-sp-editor-form">
        {FORM_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{f.label}</span>
            <input
              ref={(el) => {
                advancedRefs.current[i] = el
              }}
              type="number"
              min={f.min}
              max={f.max}
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

export function createHupuEditor(
  options: HupuSourceOptions,
  settings: SourceSettings,
): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshHupuOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(
      <HupuEditorForm fresh={fresh} settings={settings} ctx={ctx} handleRef={handleRef} />,
      container,
    )
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
