import type { Runtime } from '../../runtime'
import { loadConfigSection, validateConfig } from '../config'
import { bindErrorBox, saveConfigSection, validateNumberInput } from '../editor-helpers'
import type { SourceEditor } from '../types'
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
    maxItems: typeof raw['maxItems'] === 'number' ? (raw['maxItems'] as number) : fallback.maxItems,
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
): Promise<void> {
  const fresh = await loadFreshV2exOptions(ctx.runtime, options)

  container.insertAdjacentHTML(
    'beforeend',
    `<div class="gm-sp-v2ex-editor">
      <div class="gm-sp-v2ex-editor-form">
        <label class="gm-sp-v2ex-editor-row">
          <span>TTL（分钟）</span>
          <input type="number" min="1" step="1" class="gm-sp-v2e-ttl" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>最少条数</span>
          <input type="number" min="1" step="1" class="gm-sp-v2e-min" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>最多条数</span>
          <input type="number" min="1" step="1" class="gm-sp-v2e-max" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>显示比例</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-v2e-ratio" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>拐点跌幅</span>
          <input type="number" min="0" max="1" step="0.01" class="gm-sp-v2e-elbow" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>回复阈值</span>
          <input type="number" min="0" step="1" class="gm-sp-v2e-min-replies" />
        </label>
        <label class="gm-sp-v2ex-editor-row">
          <span>衰减半衰期（天）</span>
          <input type="number" min="0.1" max="30" step="0.1"
                 class="gm-sp-v2e-half-life" placeholder="0.1–30" />
        </label>
      </div>
      <div class="gm-sp-v2e-error" hidden></div>
      <div class="gm-sp-v2ex-editor-actions">
        <button type="button" class="gm-sp-v2e-save gm-sp-primary">保存</button>
        <button type="button" class="gm-sp-v2e-cancel">取消</button>
      </div>
    </div>`,
  )

  const ttlInput = container.querySelector('.gm-sp-v2e-ttl') as HTMLInputElement
  const minInput = container.querySelector('.gm-sp-v2e-min') as HTMLInputElement
  const maxInput = container.querySelector('.gm-sp-v2e-max') as HTMLInputElement
  const ratioInput = container.querySelector('.gm-sp-v2e-ratio') as HTMLInputElement
  const elbowInput = container.querySelector('.gm-sp-v2e-elbow') as HTMLInputElement
  const minRepliesInput = container.querySelector('.gm-sp-v2e-min-replies') as HTMLInputElement
  const halfLifeInput = container.querySelector('.gm-sp-v2e-half-life') as HTMLInputElement
  const errorEl = container.querySelector('.gm-sp-v2e-error') as HTMLDivElement
  const saveBtn = container.querySelector('.gm-sp-v2e-save') as HTMLButtonElement
  const cancelBtn = container.querySelector('.gm-sp-v2e-cancel') as HTMLButtonElement

  ttlInput.value = String(fresh.ttlMinutes)
  minInput.value = String(fresh.minItems)
  maxInput.value = String(fresh.maxItems)
  ratioInput.value = String(fresh.displayRatio)
  elbowInput.value = String(fresh.elbowDropRatio)
  minRepliesInput.value = String(fresh.minReplies)
  halfLifeInput.value = String(fresh.ageHalfLifeDays)

  const error = bindErrorBox(errorEl)

  cancelBtn.addEventListener('click', () => {
    ctx.close()
  })

  saveBtn.addEventListener('click', () => {
    error.clear()
    const ttl = validateNumberInput(ttlInput.value, {
      min: 1,
      errorMessage: 'TTL 必须是 ≥1 的整数',
    })
    if (!ttl.ok) {
      error.show(ttl.error)
      return
    }
    const min = validateNumberInput(minInput.value, {
      min: 1,
      errorMessage: '最少条数必须是 ≥1 的整数',
    })
    if (!min.ok) {
      error.show(min.error)
      return
    }
    const max = Number(maxInput.value)
    if (!Number.isFinite(max) || max < min.value) {
      error.show('最多条数必须 ≥ 最少条数')
      return
    }
    const ratio = validateNumberInput(ratioInput.value, {
      min: 0,
      max: 1,
      errorMessage: '显示比例必须是 0~1 之间',
    })
    if (!ratio.ok) {
      error.show(ratio.error)
      return
    }
    const elbow = validateNumberInput(elbowInput.value, {
      min: 0,
      max: 1,
      errorMessage: '拐点跌幅必须是 0~1 之间',
    })
    if (!elbow.ok) {
      error.show(elbow.error)
      return
    }
    const minReplies = validateNumberInput(minRepliesInput.value, {
      min: 0,
      errorMessage: '回复阈值必须 ≥0',
    })
    if (!minReplies.ok) {
      error.show(minReplies.error)
      return
    }
    const halfLife = validateNumberInput(halfLifeInput.value, {
      min: 0.1,
      max: 30,
      errorMessage: '衰减半衰期必须是 0.1~30 之间',
    })
    if (!halfLife.ok) {
      error.show(halfLife.error)
      return
    }
    const v2ex = {
      ttlMinutes: Math.round(ttl.value),
      minItems: Math.round(min.value),
      maxItems: Math.round(max),
      displayRatio: ratio.value,
      elbowDropRatio: elbow.value,
      minReplies: Math.round(minReplies.value),
      ageHalfLifeDays: halfLife.value,
    }
    void saveConfigSection({
      runtime: ctx.runtime,
      sectionKey: 'v2ex',
      section: v2ex,
      validate: validateConfig,
      onError: (msg) => error.show(msg),
      onSuccess: () => ctx.close(),
    })
  })
}
