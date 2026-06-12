import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { loadConfigSection, validateConfig } from '../config'
import { readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorContext, SourceEditorResult } from '../types'
import type { V2exSourceOptions } from './types'

type FormField = {
  prop: string
  label: string
  min: number
  max?: number
  placeholder?: string
  errorMsg: string
}

const FORM_FIELDS: FormField[] = [
  { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
  { prop: 'minItems', label: '最少条数', min: 1, errorMsg: '最少条数必须是 ≥1 的整数' },
  { prop: 'displayRatio', label: '显示比例', min: 0, max: 1, errorMsg: '显示比例必须是 0~1 之间' },
  {
    prop: 'elbowDropRatio',
    label: '拐点跌幅',
    min: 0,
    max: 1,
    errorMsg: '拐点跌幅必须是 0~1 之间',
  },
  { prop: 'minReplies', label: '回复阈值', min: 0, errorMsg: '回复阈值必须 ≥0' },
  {
    prop: 'ageHalfLifeDays',
    label: '衰减半衰期（天）',
    min: 0.1,
    max: 30,
    placeholder: '0.1–30',
    errorMsg: '衰减半衰期必须是 0.1~30 之间',
  },
]

function coerceV2exOptions(
  raw: Record<string, unknown>,
  fallback: V2exSourceOptions,
): V2exSourceOptions {
  return {
    ttlMinutes:
      typeof raw['ttlMinutes'] === 'number' ? (raw['ttlMinutes'] as number) : fallback.ttlMinutes,
    minItems: typeof raw['minItems'] === 'number' ? (raw['minItems'] as number) : fallback.minItems,
    displayRatio:
      typeof raw['displayRatio'] === 'number'
        ? (raw['displayRatio'] as number)
        : fallback.displayRatio,
    elbowDropRatio:
      typeof raw['elbowDropRatio'] === 'number'
        ? (raw['elbowDropRatio'] as number)
        : fallback.elbowDropRatio,
    minReplies:
      typeof raw['minReplies'] === 'number' ? (raw['minReplies'] as number) : fallback.minReplies,
    ageHalfLifeDays:
      typeof raw['ageHalfLifeDays'] === 'number'
        ? (raw['ageHalfLifeDays'] as number)
        : fallback.ageHalfLifeDays,
  }
}

async function loadFreshOptions(
  runtime: import('../../runtime').Runtime,
  fallback: V2exSourceOptions,
): Promise<V2exSourceOptions> {
  return loadConfigSection(runtime, 'v2ex', fallback, (raw) => coerceV2exOptions(raw, fallback))
}

type V2exEditorFormProps = {
  fresh: V2exSourceOptions
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function V2exEditorForm({ fresh, ctx, handleRef }: V2exEditorFormProps) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const f of FORM_FIELDS) {
      const val = (fresh as Record<string, unknown>)[f.prop]
      out[f.prop] = typeof val === 'number' ? val : 0
    }
    return out
  })
  const [error, setError] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const setValue = useCallback((prop: string, val: number) => {
    setValues((prev) => ({ ...prev, [prop]: val }))
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        const inputList = inputRefs.current.filter(Boolean) as HTMLInputElement[]
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
        const v2ex: V2exSourceOptions = {
          ttlMinutes: Math.round(nums[0]),
          minItems: Math.round(nums[1]),
          displayRatio: nums[2],
          elbowDropRatio: nums[3],
          minReplies: Math.round(nums[4]),
          ageHalfLifeDays: nums[5],
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'v2ex',
          section: v2ex,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => ctx.close(),
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [])

  return (
    <div class="gm-sp-editor">
      <div class="gm-sp-editor-form">
        {FORM_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{f.label}</span>
            <input
              ref={(el) => {
                inputRefs.current[i] = el
              }}
              type="number"
              class="gm-sp-input"
              min={f.min}
              max={f.max}
              placeholder={f.placeholder}
              value={values[f.prop]}
              onInput={(e) => setValue(f.prop, Number((e.target as HTMLInputElement).value))}
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

export function createV2exEditor(options: V2exSourceOptions): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(<V2exEditorForm fresh={fresh} ctx={ctx} handleRef={handleRef} />, container)
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
