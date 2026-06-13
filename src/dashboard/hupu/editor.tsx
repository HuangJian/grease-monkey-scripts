import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { escapeHtml } from '../../utils'
import { validateConfig } from '../config'
import { readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
import { normalizeBoardSlug } from './parser'
import type { HupuSourceOptions } from './types'
import { loadFreshHupuOptions } from './source'

const FORM_FIELDS: {
  prop: string
  label: string
  min: number
  max?: number
  errorMsg: string
}[] = [
  { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
  { prop: 'historyDays', label: '历史保留天数', min: 1, errorMsg: '历史保留天数必须是 ≥1 的整数' },
  {
    prop: 'todayMinReplies',
    label: '今日最低回复',
    min: 0,
    errorMsg: '今日最低回复必须 ≥0',
  },
  {
    prop: 'olderMinReplies',
    label: '历史最低回复',
    min: 0,
    errorMsg: '历史最低回复必须 ≥0',
  },
  {
    prop: 'ageHalfLifeDays',
    label: '衰减半衰期（天）',
    min: 0.1,
    max: 30,
    errorMsg: '衰减半衰期必须是 0.1~30 之间',
  },
  {
    prop: 'lightsWeight',
    label: '亮了权重',
    min: 0,
    max: 100,
    errorMsg: '亮了权重必须是 0~100 之间',
  },
  {
    prop: 'repliesWeight',
    label: '回复权重',
    min: 0,
    max: 100,
    errorMsg: '回复权重必须是 0~100 之间',
  },
]

type HupuEditorFormProps = {
  fresh: HupuSourceOptions
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function HupuEditorForm({ fresh, ctx, handleRef }: HupuEditorFormProps) {
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
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [boards, advanced])

  return (
    <div class="gm-sp-editor">
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

export function createHupuEditor(options: HupuSourceOptions): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshHupuOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(<HupuEditorForm fresh={fresh} ctx={ctx} handleRef={handleRef} />, container)
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
