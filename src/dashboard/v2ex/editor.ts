import type { Runtime } from '../../runtime'
import { loadConfigSection, validateConfig } from '../config'
import { bindErrorBox, readNumberFields, saveConfigSection } from '../editor-helpers'
import type { SourceEditor, SourceEditorResult } from '../types'
import type { V2exSourceOptions } from './types'

export function createV2exEditor(options: V2exSourceOptions): SourceEditor {
  return (container, ctx) => renderV2exEditor(container, options, ctx)
}

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

async function loadFreshV2exOptions(
  runtime: Runtime,
  fallback: V2exSourceOptions,
): Promise<V2exSourceOptions> {
  return loadConfigSection(runtime, 'v2ex', fallback, (raw) => coerceV2exOptions(raw, fallback))
}

async function renderV2exEditor(
  container: HTMLElement,
  options: V2exSourceOptions,
  ctx: { runtime: Runtime; onRevert: () => void; close: () => void },
): Promise<SourceEditorResult> {
  const fresh = await loadFreshV2exOptions(ctx.runtime, options)

  const formFields: {
    prop: string
    label: string
    min: number
    max?: number
    placeholder?: string
    errorMsg: string
  }[] = [
    { prop: 'ttlMinutes', label: 'TTL（分钟）', min: 1, errorMsg: 'TTL 必须是 ≥1 的整数' },
    { prop: 'minItems', label: '最少条数', min: 1, errorMsg: '最少条数必须是 ≥1 的整数' },
    {
      prop: 'displayRatio',
      label: '显示比例',
      min: 0,
      max: 1,
      errorMsg: '显示比例必须是 0~1 之间',
    },
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

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-editor">
      <div class="gm-sp-editor-form">
${formFields
  .map(
    (f) =>
      `        <label class="gm-sp-editor-row">
          <span>${f.label}</span>
          <input type="number" class="gm-sp-input"${f.min !== undefined ? ` min="${f.min}"` : ''}${f.max !== undefined ? ` max="${f.max}"` : ''}${f.placeholder !== undefined ? ` placeholder="${f.placeholder}"` : ''} />
        </label>`,
  )
  .join('\n')}
      </div>
      <div class="gm-sp-editor-error" hidden></div>
    </div>`,
  )

  const numberInputs = container.querySelectorAll<HTMLInputElement>(
    '.gm-sp-editor-form input[type="number"]',
  )
  for (let i = 0; i < formFields.length; i++) {
    numberInputs[i].value = String((fresh as Record<string, unknown>)[formFields[i].prop])
  }

  const errorEl = container.querySelector('.gm-sp-editor-error') as HTMLDivElement
  const error = bindErrorBox(errorEl)

  return {
    render() {},
    cancel() {
      ctx.close()
    },
    save() {
      error.clear()
      const nums = readNumberFields(
        formFields.map((f, i) => ({
          input: numberInputs[i],
          min: f.min,
          max: f.max,
          errorMessage: f.errorMsg,
        })),
        (msg) => error.show(msg),
      )
      if (nums === null) return
      const [ttl, min, ratio, elbow, minReplies, halfLife] = nums
      const v2ex = {
        ttlMinutes: Math.round(ttl),
        minItems: Math.round(min),
        displayRatio: ratio,
        elbowDropRatio: elbow,
        minReplies: Math.round(minReplies),
        ageHalfLifeDays: halfLife,
      }
      void saveConfigSection({
        runtime: ctx.runtime,
        sectionKey: 'v2ex',
        section: v2ex,
        validate: validateConfig,
        onError: (msg) => error.show(msg),
        onSuccess: () => ctx.close(),
      })
    },
  }
}
