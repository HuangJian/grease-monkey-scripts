import { useCallback, useLayoutEffect, useRef, useState } from 'preact/hooks'
import { numberOrDefault } from '../../../utils'
import { validateConfig } from '../../config'
import { createEditorFactory } from '../../editor-helpers/createEditorFactory'
import {
  readNumberFields,
  saveConfigSection,
  saveSourceSettings,
  fieldLabel,
  toFieldRule,
} from '../../editor-helpers'
import { SourceSettingsFields, ChipList } from '../../editor-ui'
import type { SourceEditorContext, SourceEditorResult, SourceSettings } from '../../types'
import { normalizeSubredditName } from '../parser'
import type { RedditSourceOptions } from '../types'
import { loadFreshRedditOptions } from '../source'
import { FORM_FIELDS } from './types'

type RedditEditorFormProps = {
  fresh: RedditSourceOptions
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

export function RedditEditorForm({ fresh, settings, ctx, handleRef }: RedditEditorFormProps) {
  const [subs, setSubs] = useState<string[]>(() =>
    fresh.subreddits.map(normalizeSubredditName).filter((s) => s.length > 0),
  )
  const [error, setError] = useState('')
  const [advanced, setAdvanced] = useState<Record<string, number>>(() =>
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
  const advancedRefs = useRef<(HTMLInputElement | null)[]>([])

  const onAdvancedChange = useCallback((prop: string, val: number) => {
    setAdvanced((prev) => ({ ...prev, [prop]: val }))
  }, [])

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        if (subs.length === 0) {
          setError('至少添加一个 subreddit')
          return
        }
        const inputList = advancedRefs.current.filter(Boolean) as HTMLInputElement[]
        const nums = readNumberFields(
          FORM_FIELDS.map((f, i) => toFieldRule(inputList[i], f)),
          (msg) => setError(msg),
        )
        if (nums === null) return
        const reddit: RedditSourceOptions = {
          ttlMinutes: Math.round(nums[0]),
          retentionDays: Math.round(nums[1]),
          todayMinComments: Math.round(nums[2]),
          olderMinComments: Math.round(nums[3]),
          ageHalfLifeDays: nums[4],
          subreddits: [...subs],
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'reddit',
          section: reddit,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'reddit', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [subs, advanced, tabTitle, priority, badgeType])

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
        sectionLabel="Subreddit 列表"
        items={subs}
        emptyMessage="尚未添加 subreddit"
        addInputPlaceholder="r/funny 或 funny"
        renderLabel={(name) => `r/${name}`}
        onRemove={(i) => setSubs((prev) => prev.filter((_, j) => j !== i))}
        onMoveUp={(i) => {
          if (i <= 0) return
          setSubs((prev) => {
            const next = [...prev]
            ;[next[i - 1], next[i]] = [next[i]!, next[i - 1]!]
            return next
          })
        }}
        onMoveDown={(i) => {
          setSubs((prev) => {
            if (i >= prev.length - 1) return prev
            const next = [...prev]
            ;[next[i], next[i + 1]] = [next[i + 1]!, next[i]!]
            return next
          })
        }}
        onAdd={(raw) => {
          const normalized = normalizeSubredditName(raw)
          if (!normalized) return '请输入有效的 subreddit 名称'
          if (subs.includes(normalized)) return `r/${normalized} 已在列表中`
          setSubs((prev) => [...prev, normalized])
          return null
        }}
        onError={setError}
      />
      <div class="gm-sp-editor-form">
        {FORM_FIELDS.map((f, i) => (
          <label class="gm-sp-editor-row" key={f.prop}>
            <span>{fieldLabel(f)}</span>
            <input
              ref={(el) => {
                advancedRefs.current[i] = el
              }}
              type="number"
              class="gm-sp-input"
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

export function createRedditEditor(options: RedditSourceOptions, settings: SourceSettings) {
  return createEditorFactory(
    (runtime) => loadFreshRedditOptions(runtime, options),
    RedditEditorForm,
    (fresh) => ({ fresh, settings }),
  )
}
