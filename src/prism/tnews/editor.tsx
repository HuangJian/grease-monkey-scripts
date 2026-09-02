import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { validateConfig } from '../config'
import { createEditorFactory } from '../editor-helpers/createEditorFactory'
import { loadFreshTnewsOptions } from './options'
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
import type { TnewsSourceOptions } from './types'

const TTL_FIELD: NumberFieldDef = {
  prop: 'ttlMinutes',
  name: 'TTL',
  unit: '分钟',
  min: 1,
  integer: true,
}

type TnewsEditorFormProps = {
  fresh: TnewsSourceOptions
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function TnewsEditorForm({ fresh, settings, ctx, handleRef }: TnewsEditorFormProps) {
  const [error, setError] = useState('')
  const [ttl, setTtl] = useState(fresh.ttlMinutes)
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
  const [badgeType, setBadgeType] = useState(settings.badgeType)
  const ttlRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    handleRef.current = {
      render() {},
      save() {
        setError('')
        const nums = readNumberFields([toFieldRule(ttlRef.current!, TTL_FIELD)], (msg) =>
          setError(msg),
        )
        if (nums === null) return
        const tnews: TnewsSourceOptions = {
          ttlMinutes: Math.round(nums[0]),
        }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'tnews',
          section: tnews,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'tnews', { tabTitle, priority, badgeType })
            ctx.refresh?.()
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [ttl, tabTitle, priority, badgeType])

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
        <label class="gm-sp-editor-row">
          <span>{fieldLabel(TTL_FIELD)}</span>
          <input
            ref={ttlRef}
            type="number"
            min="1"
            step="1"
            class="gm-sp-input"
            value={ttl}
            onInput={(e) => setTtl(Number((e.target as HTMLInputElement).value))}
          />
        </label>
      </div>
      <div class="gm-sp-editor-error" hidden={!error}>
        {error}
      </div>
    </div>
  )
}

export function createTnewsEditor(options: TnewsSourceOptions, settings: SourceSettings) {
  return createEditorFactory(
    (runtime) => loadFreshTnewsOptions(runtime, options),
    TnewsEditorForm,
    (fresh) => ({ fresh, settings }),
  )
}
