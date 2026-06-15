import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { render } from 'preact'
import { validateConfig } from '../../config'
import { readNumberFields, saveConfigSection, saveSourceSettings } from '../../editor-helpers'
import { SourceSettingsFields, ChipList } from '../../editor-ui'
import type {
  SourceEditor,
  SourceEditorContext,
  SourceEditorResult,
  SourceSettings,
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
  const [advanced, setAdvanced] = useState<Record<string, number>>(() =>
    FORM_FIELDS.reduce(
      (out, f) => {
        const val = (fresh as Record<string, unknown>)[f.prop]
        out[f.prop] = typeof val === 'number' ? val : 0
        return out
      },
      {} as Record<string, number>,
    ),
  )
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
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
      <SourceSettingsFields
        tabTitle={tabTitle}
        onTabTitleChange={setTabTitle}
        priority={priority}
        onPriorityChange={setPriority}
        badgeType={badgeType}
        onBadgeTypeChange={setBadgeType}
      />
      <ChipList
        sectionLabel="版块列表"
        items={boards}
        emptyMessage="尚未添加版块"
        addInputPlaceholder="vote-hot 或 bxj"
        onRemove={(i) => setBoards((prev) => prev.filter((_, j) => j !== i))}
        onMoveUp={(i) => {
          if (i <= 0) return
          setBoards((prev) => {
            const next = [...prev]
            ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
            return next
          })
        }}
        onMoveDown={(i) => {
          setBoards((prev) => {
            if (i >= prev.length - 1) return prev
            const next = [...prev]
            ;[next[i], next[i + 1]] = [next[i + 1]!, next[i]!]
            return next
          })
        }}
        onAdd={(raw) => {
          const normalized = normalizeBoardSlug(raw)
          if (!normalized) return '请输入有效的版块标识'
          if (boards.includes(normalized)) return `${normalized} 已在列表中`
          setBoards((prev) => [...prev, normalized])
          return null
        }}
        onError={setError}
      />
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
