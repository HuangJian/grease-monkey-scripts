import { useLayoutEffect, useRef, useState } from 'preact/hooks'
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
import type { SourceEditorContext, SourceEditorResult, SourceSettings } from '../types'
import type { MiscOptions } from './types'
import type { Runtime } from '../../runtime'

const TTL_FIELD: NumberFieldDef = {
  prop: 'ttlMinutes',
  name: 'TTL',
  unit: '分钟',
  min: 1,
  integer: true,
}

function coerceMiscOptions(raw: Record<string, unknown>, fallback: MiscOptions): MiscOptions {
  return {
    ttlMinutes: numberOrDefault(raw['ttlMinutes'], fallback.ttlMinutes),
  }
}

async function loadFreshOptions(runtime: Runtime, fallback: MiscOptions): Promise<MiscOptions> {
  return loadConfigSection(runtime, 'misc', fallback, (raw) => coerceMiscOptions(raw, fallback))
}

type MiscEditorFormProps = {
  fresh: MiscOptions
  settings: SourceSettings
  ctx: SourceEditorContext
  handleRef: { current: SourceEditorResult | null }
}

function MiscEditorForm({ fresh, settings, ctx, handleRef }: MiscEditorFormProps) {
  const [error, setError] = useState('')
  const [ttl, setTtl] = useState(fresh.ttlMinutes)
  const [tabTitle, setTabTitle] = useState(settings.tabTitle)
  const [priority, setPriority] = useState(settings.priority)
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
        const misc: MiscOptions = { ttlMinutes: Math.round(nums[0]!) }
        void saveConfigSection({
          runtime: ctx.runtime,
          sectionKey: 'misc',
          section: misc,
          validate: validateConfig,
          onError: (msg) => setError(msg),
          onSuccess: () => {
            void saveSourceSettings(ctx.runtime, 'misc', {
              tabTitle,
              priority,
              badgeType: 'default',
            })
            ctx.close()
          },
        })
      },
      cancel() {
        ctx.close()
      },
    }
  }, [ttl, tabTitle, priority])

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
      </div>
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

export function createMiscEditor(options: MiscOptions, settings: SourceSettings) {
  return createEditorFactory(
    (runtime) => loadFreshOptions(runtime, options),
    MiscEditorForm,
    (fresh) => ({ fresh, settings }),
  )
}

export { loadFreshOptions as loadFreshMiscOptions }
