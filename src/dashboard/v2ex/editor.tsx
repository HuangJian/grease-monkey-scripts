import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { loadConfigSection, validateConfig } from '../config'
import { readNumberFields, saveConfigSection, saveSourceSettings } from '../editor-helpers'
import { SourceSettingsFields } from '../editor-ui'
import type {
  SourceEditor,
  SourceEditorContext,
  SourceEditorResult,
  SourceSettings,
} from '../types'
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

    todayMinReplies:
      typeof raw['todayMinReplies'] === 'number'
        ? (raw['todayMinReplies'] as number)
        : fallback.todayMinReplies,
    olderMinReplies:
      typeof raw['olderMinReplies'] === 'number'
        ? (raw['olderMinReplies'] as number)
        : fallback.olderMinReplies,
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
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function V2exEditorForm({ fresh, settings, ctx, handleRef }: V2exEditorFormProps) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    FORM_FIELDS.reduce(
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
          todayMinReplies: Math.round(nums[1]),
          olderMinReplies: Math.round(nums[2]),
          ageHalfLifeDays: nums[3],
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'v2ex',
          section: v2ex,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'v2ex', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [values, tabTitle, priority, badgeType])

  return (
    <div class="gm-sp-editor">
      <SourceSettingsFields
        tabTitle={tabTitle}
        onTabTitleChange={setTabTitle}
        priority={priority}
        onPriorityChange={setPriority}
        badgeType={badgeType}
        onBadgeTypeChange={setBadgeType}
      />
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

export function createV2exEditor(
  options: V2exSourceOptions,
  settings: SourceSettings,
): SourceEditor {
  return async (container, ctx): Promise<SourceEditorResult> => {
    const fresh = await loadFreshOptions(ctx.runtime, options)
    const handleRef: { current: SourceEditorResult | null } = { current: null }
    render(
      <V2exEditorForm fresh={fresh} settings={settings} ctx={ctx} handleRef={handleRef} />,
      container,
    )
    return {
      render: () => handleRef.current?.render?.(),
      save: () => handleRef.current?.save?.(),
      cancel: () => handleRef.current?.cancel?.(),
    }
  }
}
