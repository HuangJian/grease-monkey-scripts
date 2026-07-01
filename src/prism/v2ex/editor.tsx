import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { numberOrDefault } from '../../utils'
import { loadConfigSection, validateConfig } from '../config'
import { createEditorFactory } from '../editor-helpers/createEditorFactory'
import {
  readNumberFields,
  saveConfigSection,
  saveSourceSettings,
  fieldLabel,
  toFieldRule,
  type NumberFieldDef,
} from '../editor-helpers'
import { SourceSettingsFields } from '../editor-ui'
import type { SourceEditorContext, SourceEditorResult, SourceSettings } from '../types'
import type { V2exSourceOptions } from './types'

const FORM_FIELDS: NumberFieldDef[] = [
  { prop: 'ttlMinutes', name: 'TTL', unit: '分钟', min: 1, integer: true },
  { prop: 'retentionDays', name: '数据保留', unit: '天', min: 1, max: 90, integer: true },
  { prop: 'todayMinReplies', name: '今日最低回复', min: 0 },
  { prop: 'olderMinReplies', name: '历史最低回复', min: 0 },
  {
    prop: 'ageHalfLifeDays',
    name: '衰减半衰期',
    unit: '天',
    min: 0.1,
    max: 30,
    placeholder: '0.1–30',
  },
]

function coerceV2exOptions(
  raw: Record<string, unknown>,
  fallback: V2exSourceOptions,
): V2exSourceOptions {
  return {
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
    retentionDays: numberOrDefault(raw['retentionDays'], fallback.retentionDays),
    todayMinReplies: numberOrDefault(raw['todayMinReplies'], fallback.todayMinReplies),
    olderMinReplies: numberOrDefault(raw['olderMinReplies'], fallback.olderMinReplies),
    ageHalfLifeDays: numberOrDefault(raw['ageHalfLifeDays'], fallback.ageHalfLifeDays),
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
        out[f.prop] = numberOrDefault(val, 0)
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
          FORM_FIELDS.map((f, i) => toFieldRule(inputList[i], f)),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const v2ex: V2exSourceOptions = {
          ttlMinutes: Math.round(nums[0]),
          retentionDays: Math.round(nums[1]),
          todayMinReplies: Math.round(nums[2]),
          olderMinReplies: Math.round(nums[3]),
          ageHalfLifeDays: nums[4],
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
            <span>{fieldLabel(f)}</span>
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

export function createV2exEditor(options: V2exSourceOptions, settings: SourceSettings) {
  return createEditorFactory(
    (runtime) => loadFreshOptions(runtime, options),
    V2exEditorForm,
    (fresh) => ({ fresh, settings }),
  )
}
